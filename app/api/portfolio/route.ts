
import { NextResponse } from 'next/server';
import { fetchFlexReport } from '@/lib/ibkr/api';
import { parseIBKRXml, CashTransaction, OpenPosition, EquitySummary, CashReport, Transfer } from '@/lib/ibkr-parser';
import { getHistoricalFxRates } from '@/lib/finance/fx-rates';
import { getHistoricalPrices, getEnhancedStockData, EnhancedSymbolData } from '@/lib/yahoo-finance';
import { calculateComparison } from '@/lib/calculation-engine';
import { processTransactions } from '@/lib/portfolio/transaction-processor';
import { calculateAllocations } from '@/lib/portfolio/allocator';

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'debug_log_temp.txt');

function logToFile(message: string) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message} \n`;
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (err) {
        // ignore
    }
}

// (imports remain)

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, queryId, manualHistory, targetCurrency = 'USD' } = body;

        logToFile(`--- API CALL START: Target=${targetCurrency} ---`);

        // Unified list of all file data (Manual + Live)
        let processedFiles: any[] = [];

        // 1. Collect Manual History
        if (Array.isArray(manualHistory)) {
            processedFiles = [...manualHistory];
        }

        // 2. Fetch Live Reports
        if (token && queryId) {
            const queryIds = queryId.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
            for (const qId of queryIds) {
                try {
                    const xmlData = await fetchFlexReport(token, qId);
                    const parsed = parseIBKRXml(xmlData);
                    processedFiles.push({ ...parsed, fileName: `Live-${qId}` });
                } catch (err) {
                    console.error(`Error fetching / parsing query ${qId}: `, err);
                }
            }
        }

        if (processedFiles.length === 0) {
            return NextResponse.json({ error: 'No data provided from manual history or live reports.' }, { status: 400 });
        }

        // 3. Sort Files by Date (Oldest to Newest)
        processedFiles.sort((a, b) => {
            const getFileDate = (f: any) => {
                if (f.toDate) return f.toDate;
                if (f.equitySummary && f.equitySummary.length > 0) {
                    const acts = f.equitySummary.map((e: any) => e.reportDate).sort();
                    return acts[acts.length - 1];
                }
                return '0000-00-00';
            };
            return getFileDate(a).localeCompare(getFileDate(b));
        });

        // 4. Determine Master Base Currency (from the latest file)
        const lastFile = processedFiles[processedFiles.length - 1];
        let detectedBaseCurrency = lastFile.baseCurrency || 'USD';

        let allCashTransactions: CashTransaction[] = [];
        let allEquitySummary: EquitySummary[] = [];
        // Consolidate Latest Positions / Cash from EACH Account ID
        const accountLatestMap = new Map<string, any>();
        for (const f of processedFiles) {
            // Robust Account ID extraction
            let accId = f.accountId;
            if (!accId && f.cashTransactions && f.cashTransactions.length > 0) {
                accId = f.cashTransactions[0].accountId;
            }
            if (!accId && f.equitySummary && f.equitySummary.length > 0) {
                accId = f.equitySummary[0].accountId;
            }
            accId = accId || 'Unknown';

            logToFile(`[DEBUG] Processing File: ${f.fileName} with AccountID: ${accId} (Raw: ${f.accountId})`);
            // Since processedFiles is already sorted by Date, simply overwriting ensures we keep the latest for this account
            accountLatestMap.set(accId, f);
        }

        let latestOpenPositions: OpenPosition[] = [];
        let latestCashReports: CashReport[] = [];

        accountLatestMap.forEach((file) => {
            if (file.openPositions) latestOpenPositions.push(...file.openPositions);
            if (file.cashReports) latestCashReports.push(...file.cashReports);
        });

        // If no positions found (e.g. empty files), fallback to lastFile
        if (latestOpenPositions.length === 0 && lastFile.openPositions) {
            latestOpenPositions = lastFile.openPositions;
        }
        if (latestCashReports.length === 0 && lastFile.cashReports) {
            latestCashReports = lastFile.cashReports;
        }

        // 5. Normalize & Merge
        for (const file of processedFiles) {
            const fileBase = file.baseCurrency || 'USD';

            // Collect Equity Summary (converting if needed)
            if (file.equitySummary && file.equitySummary.length > 0) {
                let normalized = file.equitySummary;

                if (fileBase !== detectedBaseCurrency) {
                    // Need normalization
                    const dates = file.equitySummary.map((e: any) => e.reportDate).sort();
                    const start = dates[0];
                    const end = dates[dates.length - 1];

                    // Fetch range rates
                    if (start && end) {
                        const rates = await getHistoricalFxRates(fileBase, detectedBaseCurrency, new Date(start), new Date(end));
                        // Build Map
                        const rateMap = new Map<string, number>();
                        rates.forEach(r => rateMap.set(r.date.split('T')[0], r.rate));

                        normalized = file.equitySummary.map((e: any) => {
                            // Lookup rate with fallback
                            const r = getRateWithLookback(rateMap, e.reportDate);
                            return {
                                ...e,
                                total: e.total * r,
                                dividendAccruals: (e.dividendAccruals || 0) * r,
                                interestAccruals: (e.interestAccruals || 0) * r,
                                currency: detectedBaseCurrency // Now standardized
                            };
                        });
                        logToFile(`[NORM] Normalized ${normalized.length} Equity entries from ${fileBase} to ${detectedBaseCurrency}`);
                    }
                }
                allEquitySummary = [...allEquitySummary, ...normalized];
            }

            // Collect Cash Transactions (converting fxRateToBase if needed)
            let txs: CashTransaction[] = file.cashTransactions || [];
            if (file.transfers) {
                const transfers = (file.transfers as Transfer[]).map(t => ({
                    amount: t.amount,
                    currency: t.currency,
                    date: t.date,
                    description: `Transfer ${t.direction} (${t.type})`,
                    type: t.type,
                    transactionId: t.transactionID,
                    fxRateToBase: t.fxRateToBase || 1,
                    accountId: t.accountId,
                    acctAlias: t.acctAlias,
                    levelOfDetail: 'detail'
                }));
                // @ts-ignore
                txs = [...txs, ...transfers];
            }

            if (fileBase !== detectedBaseCurrency && txs.length > 0) {
                // Fetch rates for txs
                // We need rates for specific transaction dates.
                const dates = txs.map((t: any) => t.date?.split('T')[0]).sort(); // Ensure YYYY-MM-DD
                if (dates.length > 0) {
                    const start = dates[0];
                    const end = dates[dates.length - 1];
                    const rates = await getHistoricalFxRates(fileBase, detectedBaseCurrency, new Date(start), new Date(end));
                    const rateMap = new Map<string, number>();
                    rates.forEach(r => rateMap.set(r.date.split('T')[0], r.rate));

                    txs = txs.map(t => {
                        const dateStr = t.date?.split('T')[0] || '';
                        const conversionRate = getRateWithLookback(rateMap, dateStr);
                        // Modify fxRateToBase so downstream calc (amount * fxRate) produces Correct MasterBase Amount
                        // newFx = oldFx * conversionRate
                        return {
                            ...t,
                            fxRateToBase: (t.fxRateToBase || 1) * conversionRate
                        };
                    });
                    logToFile(`[NORM] Normalized ${txs.length} Transactions from ${fileBase} to ${detectedBaseCurrency}`);
                }
            }
            allCashTransactions = [...allCashTransactions, ...txs];
        }


        // 2.5 Patch OpenPositions with Granular Cash Reports if available
        if (latestCashReports.length > 0) {
            logToFile(`[DEBUG] Found ${latestCashReports.length} granular cash reports. Processing...`);

            // Identify currencies that need conversion to Base
            const cashCurrencies = new Set<string>();
            latestCashReports.forEach(r => {
                if (r.currency !== detectedBaseCurrency && Math.abs(r.totalCash) > 0.01) {
                    cashCurrencies.add(r.currency);
                }
            });

            // Fetch FX Rates for Cash (Currency -> Base) for the latest available date
            // We use 'today' or the latest report date implicitly? 
            // Better to use a recent window.
            const cashFxRates = new Map<string, number>();
            if (cashCurrencies.size > 0) {
                try {
                    // Since we don't have exact report date easily accessible here (it's in equitySummary usually),
                    // we'll use a short recent lookback from today. 
                    // Warning: If report is old (manual history), using today's rate is wrong.
                    // But usually manual history 'latestOpenPositions' comes with a date?
                    // The 'manualHistory' loop uses 'fileDate'.
                    // Let's assume 'today' for simplicity or last 3 days to get *a* rate.
                    // Ideally we should use the report Date from EquitySummary.
                    let refDate = new Date();
                    if (allEquitySummary.length > 0) {
                        const dates = allEquitySummary.map(e => e.reportDate).sort();
                        const lastDate = dates[dates.length - 1];
                        if (lastDate) refDate = new Date(lastDate);
                    }

                    // For each currency, fetch rate to Base
                    for (const curr of Array.from(cashCurrencies)) {
                        const rates = await getHistoricalFxRates(curr, detectedBaseCurrency, new Date(refDate.getTime() - 86400000 * 5), new Date(refDate.getTime() + 86400000));
                        if (rates.length > 0) {
                            cashFxRates.set(curr, rates[rates.length - 1].rate);
                        } else {
                            logToFile(`[WARN] No FX rate found for Cash: ${curr} -> ${detectedBaseCurrency}. Using 1.0`);
                            cashFxRates.set(curr, 1.0);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch Cash FX rates:", e);
                }
            }

            // Remove generic/aggregated CASH positions from OpenPositions
            // Aggregated positions usually have assetCategory='CASH' or symbol='CASH' or symbol=BaseCurrency
            // We want to replace these with our specific CashReport entries.
            latestOpenPositions = latestOpenPositions.filter(p => {
                // Keep if NOT cash
                const isCash = p.assetCategory === 'CASH' || p.symbol === 'CASH' || p.symbol === detectedBaseCurrency;
                return !isCash;
            });

            // Add Granular Cash Positions
            latestCashReports.forEach(report => {
                // Filter small balances?
                if (Math.abs(report.settledCash) < 0.01 && Math.abs(report.totalCash) < 0.01) return;

                // Determine Value in Base
                let rateToBase = 1;
                if (report.currency !== detectedBaseCurrency) {
                    rateToBase = cashFxRates.get(report.currency) || 1;
                }

                // Use totalCash (which includes accrued) or settledCash? Usually totalCash matches 'Cash' balance.
                const finalAmount = report.totalCash;
                const valueInBase = finalAmount * rateToBase;

                latestOpenPositions.push({
                    symbol: report.currency, // Display symbol (e.g. SGD)
                    currency: report.currency,
                    quantity: finalAmount,
                    markPrice: 1, // It's cash
                    costBasisPrice: 1, // It's cash
                    costBasisMoney: finalAmount, // Cost is same as amount usually for cash unless tracking forex cost basis
                    value: valueInBase, // Crucial for Net Worth calc
                    percentOfNAV: 0, // Recalculated later
                    assetCategory: 'CASH',
                    levelOfDetail: 'SUMMARY'
                });
            });

            logToFile(`[DEBUG] Updated positions with ${latestCashReports.length} cash entries.`);
        }

        // 2.5.1 Normalize Open Positions to Base Currency
        // The XML parsing often yields values in Native Currency (e.g. USD for US Stocks), 
        // but we need Base Currency (e.g. SGD) for correct allocation totals matching NAV.
        if (latestOpenPositions.length > 0 && detectedBaseCurrency) {
            const posCurrencies = new Set<string>();
            latestOpenPositions.forEach(p => {
                if (p.currency && p.currency !== detectedBaseCurrency && p.assetCategory !== 'CASH') {
                    posCurrencies.add(p.currency);
                }
            });

            if (posCurrencies.size > 0) {
                const posFxRates = new Map<string, number>();
                try {
                    let refDate = new Date();
                    if (allEquitySummary.length > 0) {
                        const dates = allEquitySummary.map(e => e.reportDate).sort();
                        const lastDate = dates[dates.length - 1];
                        if (lastDate) refDate = new Date(lastDate);
                    }

                    for (const curr of Array.from(posCurrencies)) {
                        const rates = await getHistoricalFxRates(curr, detectedBaseCurrency, new Date(refDate.getTime() - 86400000 * 5), new Date(refDate.getTime() + 86400000));
                        if (rates.length > 0) {
                            posFxRates.set(curr, rates[rates.length - 1].rate);
                        } else {
                            // Fallback to 1 if failure? Or maybe we can rely on cash rates if available?
                            posFxRates.set(curr, 1);
                        }
                    }

                    // Apply conversion
                    latestOpenPositions = latestOpenPositions.map(p => {
                        if (p.currency && p.currency !== detectedBaseCurrency && p.assetCategory !== 'CASH') {
                            const rate = posFxRates.get(p.currency) || 1;
                            return {
                                ...p,
                                value: p.value * rate,
                                costBasisMoney: p.costBasisMoney * rate
                            };
                        }
                        return p;
                    });
                    logToFile(`[NORM] Normalized ${latestOpenPositions.length} Open Positions to ${detectedBaseCurrency}`);
                } catch (e) {
                    console.error("Failed to normalize Open Positions:", e);
                }
            }
        }





        // 2.6 Inject Receivable/Accrual Positions from Equity Summary
        // This ensures Portfolio Allocation matches the official NAV which includes these accruals.
        if (allEquitySummary.length > 0) {
            // Find the latest equity summary to get current accruals
            const latestEquity = allEquitySummary.reduce((latest, current) => {
                return (current.reportDate > latest.reportDate) ? current : latest;
            }, allEquitySummary[0]);

            const divAccruals = latestEquity.dividendAccruals || 0;
            if (Math.abs(divAccruals) > 0.01) {
                logToFile(`[DEBUG] Injecting Dividend Accrual: ${divAccruals} ${latestEquity.currency}`);
                latestOpenPositions.push({
                    symbol: 'Dividends Receivable',
                    quantity: divAccruals,
                    costBasisPrice: 1,
                    costBasisMoney: divAccruals,
                    markPrice: 1,
                    value: divAccruals, // Assumed in Base Currency as EquitySummary is normalized
                    currency: latestEquity.currency || detectedBaseCurrency,
                    percentOfNAV: 0,
                    levelOfDetail: 'SUMMARY',
                    assetCategory: 'RECEIVABLE'
                });
            }

            const intAccruals = latestEquity.interestAccruals || 0;
            if (Math.abs(intAccruals) > 0.01) {
                logToFile(`[DEBUG] Injecting Interest Accrual: ${intAccruals} ${latestEquity.currency}`);
                latestOpenPositions.push({
                    symbol: 'Interest Accrual',
                    quantity: intAccruals,
                    costBasisPrice: 1,
                    costBasisMoney: intAccruals,
                    markPrice: 1,
                    value: intAccruals,
                    currency: latestEquity.currency || detectedBaseCurrency,
                    percentOfNAV: 0,
                    levelOfDetail: 'SUMMARY',
                    assetCategory: 'RECEIVABLE'
                });
            }
        }

        logToFile(`[DEBUG] Before processTransactions: allCashTransactions=${allCashTransactions.length}, allEquitySummary=${allEquitySummary.length}`);

        // Debug first few transactions to see if Transfers are there
        const internalTx = allCashTransactions.filter(t => t.type === 'INTERNAL');
        logToFile(`[DEBUG] Found ${internalTx.length} INTERNAL transactions in allCashTransactions.`);
        if (internalTx.length > 0) {
            logToFile(`[DEBUG] First Internal: ${JSON.stringify(internalTx[0])}`);
        }

        // 3. Process Transactions (Deduplicate, Gap Detection, Deposits, Lag)
        const { effectiveDeposits, uniqueEquityMap, warnings } = processTransactions(allCashTransactions, allEquitySummary);

        logToFile(`[DEBUG] After processTransactions: effectiveDeposits=${effectiveDeposits.length}`);

        // --- Benchmark Logic for Short Options ---
        // Requirement: Short Option Collateral (Strike * Mult * Qty) should be simulated as invested in Benchmark.
        // Since we may lack explicit 'Opening Date' for options in a snapshot, we assume this capital 
        // was required/deployed from the start (Conservative "Cash Secured" assumption).
        // We calculate the Total Collateral required for current Short Options, and if it exceeds
        // current Net Deposits, we add the difference as a "Synthetic Initial Deposit".

        let totalShortCollateralInBase = 0;
        const optionCurrencies = new Set<string>();
        const shortOptions = latestOpenPositions.filter(p => (p.assetCategory === 'OPT' || p.putCall) && p.quantity < 0);

        if (shortOptions.length > 0) {
            shortOptions.forEach(p => optionCurrencies.add(p.currency));

            // Fetch FX rates for Option Currencies -> Base
            const optionFxRates = new Map<string, number>();
            for (const curr of Array.from(optionCurrencies)) {
                if (curr === detectedBaseCurrency) {
                    optionFxRates.set(curr, 1);
                } else {
                    try {
                        const rates = await getHistoricalFxRates(curr, detectedBaseCurrency, new Date(Date.now() - 86400000 * 5), new Date());
                        optionFxRates.set(curr, rates.length > 0 ? rates[rates.length - 1].rate : 1);
                    } catch (e) {
                        console.error(`Failed to fetch option FX: ${curr}`, e);
                        optionFxRates.set(curr, 1);
                    }
                }
            }

            shortOptions.forEach(p => {
                const strike = p.strike || 0;
                const multiplier = p.multiplier || 100;
                const qty = Math.abs(p.quantity);
                const collateral = strike * multiplier * qty;
                const rate = optionFxRates.get(p.currency) || 1;
                totalShortCollateralInBase += (collateral * rate);
            });

            logToFile(`[BENCHMARK] Total Short Option Collateral: ${totalShortCollateralInBase.toFixed(2)} ${detectedBaseCurrency}`);

            // Compare with Current Net Deposits
            const currentNetDeposits = effectiveDeposits.reduce((sum, d) => sum + d.amount, 0);

            if (totalShortCollateralInBase > currentNetDeposits) {
                const shortfall = totalShortCollateralInBase - currentNetDeposits;
                logToFile(`[BENCHMARK] Collateral > Deposits. Injecting Synthetic Deposit of ${shortfall.toFixed(2)} ${detectedBaseCurrency}`);

                // Inject at the beginning
                if (effectiveDeposits.length > 0) {
                    // Add to the first deposit or create a new one at the same date
                    // We modify the array in place or create a new entry?
                    // effectiveDeposits is a const from destructuring, but the array is mutable.
                    // However, we should check if effectiveDeposits is strictly ordered or if processTransactions returns sorted.
                    // It returns sorted.

                    // We'll create a synthetic entry.
                    // Wait, effectiveDeposits contains 'originalAmount' etc.
                    effectiveDeposits.unshift({
                        date: effectiveDeposits[0].date,
                        amount: shortfall,
                        originalAmount: shortfall,
                        currency: detectedBaseCurrency,
                        description: 'Synthetic Collateral Adjustment',
                        type: 'Adjustment',
                        transactionId: 'SYNTHETIC_COLLATERAL'
                    });
                } else {
                    // If no deposits exist but we have positions (e.g. gifted stock or transfer not captured?), 
                    // create one at the earliest equity date.
                    const dates = [...uniqueEquityMap.keys()].sort();
                    const firstDate = dates[0] || new Date().toISOString().split('T')[0];
                    effectiveDeposits.push({
                        date: firstDate,
                        amount: totalShortCollateralInBase,
                        originalAmount: totalShortCollateralInBase,
                        currency: detectedBaseCurrency,
                        description: 'Synthetic Collateral Adjustment',
                        type: 'Adjustment',
                        transactionId: 'SYNTHETIC_COLLATERAL'
                    });
                }
            }
        }

        // 6. Calculate Comparison (Benchmark) with adjusted dates
        let comparisonBase: { date: string, benchmarkValue: number, totalInvested: number }[] = [];
        // Helper to convert array of {date, value}
        // We need FX rates for the entire range

        let benchmarkCurrency = 'USD'; // SPY is USD

        if (effectiveDeposits.length > 0) {
            // Sort by date ascending
            const firstDateStr = effectiveDeposits[0].date;
            const startDate = new Date(firstDateStr);
            const endDate = new Date();

            if (isNaN(startDate.getTime())) {
                console.error('Invalid start date:', firstDateStr);
            } else {
                try {
                    // Fetch FX Rates for Benchmark Calculation (Base -> USD)
                    // We need to convert deposits (in Base) to USD to buy SPY.
                    let baseToUsdRates = new Map<string, number>();
                    if (detectedBaseCurrency !== 'USD') {
                        const rates = await getHistoricalFxRates(detectedBaseCurrency, 'USD', startDate, endDate);
                        rates.forEach(r => baseToUsdRates.set(r.date, r.rate));
                    }

                    // Prepare USD Deposits
                    const usdDeposits = effectiveDeposits.map(d => {
                        let rate = 1;
                        if (detectedBaseCurrency !== 'USD') {
                            // Find rate for this date, or closest previous? 
                            // For now, exact match or fallback to 1 (which is bad, but handle gaps later if needed)
                            rate = baseToUsdRates.get(d.date) ||
                                // Try finding closest rate if exact missing?
                                1;
                        }
                        return {
                            ...d,
                            amount: d.amount * rate
                        };
                    });

                    const spyData = await getHistoricalPrices('SPY', startDate, endDate);
                    const benchmarkPrices = spyData.map(d => ({ date: d.date, close: d.close }));
                    comparisonBase = calculateComparison(usdDeposits, benchmarkPrices);
                } catch (e) {
                    console.error("Failed to fetch/calculate benchmark:", e)
                }
            }
        }

        // If comparisonBase is empty (no deposits OR benchmark failed), build it from Equity Summary dates
        if (comparisonBase.length === 0 && uniqueEquityMap.size > 0) {
            const sortedDates = [...uniqueEquityMap.keys()].sort();
            comparisonBase = sortedDates.map(date => ({
                date,
                benchmarkValue: 0,
                totalInvested: 0
            }));
        }

        // 7. Merge Portfolio Value from Equity Summary (with Fill Forward + Pending Deposits)
        let lastKnownPortfolioValue = 0;
        let pendingDeposits = 0; // Deposits that happened on days where we have NO NAV record

        const comparison = comparisonBase.map(point => {
            const val = uniqueEquityMap.get(point.date);

            // Check if any deposits happened exactly on this 'missing' day
            // We use the adjusted effectiveDeposits to map them. 
            // Actually, we should check the ORIGINAL date? No, if we shifted it, it means NAV recognizes it later.
            // But for "Missing Data" (Fill Forward), we are talking about days where val === undefined.

            // Calculate deposits on this specific chart day
            const dayDeposits = effectiveDeposits
                .filter(d => d.date === point.date)
                .reduce((sum, d) => sum + d.amount, 0);

            if (val !== undefined && val > 0) {
                lastKnownPortfolioValue = val;
                pendingDeposits = 0; // Reset because real NAV includes everything up to now (presumably)
            } else {
                // Missing data day.
                // Add today's deposits to the pending accumulator
                pendingDeposits += dayDeposits;
            }

            return {
                ...point,
                portfolioValue: val !== undefined ? val : (lastKnownPortfolioValue + pendingDeposits)
            };
        });

        // --- Currency Normalization for Output ---
        // We have:
        // - comparison: { date, benchmarkValue (USD), portfolioValue (Base) }
        // We want:
        // - comparison: { date, benchmarkValue (Target), portfolioValue (Target) }

        // Fetch Rates needed for conversion:
        // 1. USD -> Target (for Benchmark)
        // 2. Base -> Target (for Portfolio)

        let usdToTargetRates = new Map<string, number>();
        let baseToTargetRates = new Map<string, number>(); // This might be Identity if Base==Target

        if (comparison.length > 0) {
            const startDate = new Date(comparison[0].date);
            const endDate = new Date();

            logToFile(`[FX DEBUG] Detected Base: ${detectedBaseCurrency}, Target: ${targetCurrency}`);

            if (targetCurrency !== 'USD') {
                let rates = await getHistoricalFxRates('USD', targetCurrency, startDate, endDate);
                if (rates.length === 0) {
                    logToFile("Bulk FX fetch (USD->Target) empty, trying recent fallback");
                    rates = await getHistoricalFxRates('USD', targetCurrency, new Date(Date.now() - 86400000 * 7), endDate);
                }
                logToFile(`[DEBUG] USD -> ${targetCurrency} Rates: ${rates.length} found.Sample: ${JSON.stringify(rates[0])} `);
                rates.forEach(r => usdToTargetRates.set(r.date, r.rate));
            }

            if (detectedBaseCurrency !== targetCurrency) {
                let rates = await getHistoricalFxRates(detectedBaseCurrency, targetCurrency, startDate, endDate);
                if (rates.length === 0) {
                    logToFile("Bulk FX fetch (Base->Target) empty, trying recent fallback");
                    rates = await getHistoricalFxRates(detectedBaseCurrency, targetCurrency, new Date(Date.now() - 86400000 * 7), endDate);
                }
                logToFile(`[FX DEBUG] ${detectedBaseCurrency} -> ${targetCurrency} Rates: ${rates.length} found. First: ${JSON.stringify(rates[0])}, Last: ${JSON.stringify(rates[rates.length - 1])} `);
                rates.forEach(r => baseToTargetRates.set(r.date, r.rate));
            } else {
                logToFile(`[FX DEBUG] Base == Target (${detectedBaseCurrency}), rates remain 1:1`);
            }
        }

        // Apply Conversion
        // Helper to find rate with lookback
        function getRateWithLookback(map: Map<string, number>, dateStr: string, days = 5): number {
            if (map.has(dateStr)) return map.get(dateStr)!;
            // Try looking back
            const d = new Date(dateStr);
            logToFile(`[DEBUG] Lookback triggered for ${dateStr}.Map has ${map.size} entries.`);
            for (let i = 0; i < days; i++) {
                d.setDate(d.getDate() - 1);
                const s = d.toISOString().split('T')[0];
                if (map.has(s)) {
                    logToFile(`[DEBUG] Found rate for ${dateStr} at lookback ${s}: ${map.get(s)} `);
                    return map.get(s)!;
                }
            }
            logToFile(`[DEBUG] No rate found for ${dateStr} after lookback.`);
            return 1; // Fallback
        };

        // 2. Apply Conversion
        // Use latest rate for fallback if date missing
        let lastUsdToTarget = 1;
        let lastBaseToTarget = 1; // Track last valid rate for fill-forward

        // Pre-calculate Cumulative Deposits in Target Currency (Historical Cost)
        // This ensures Net Deposits line is flat (if no new deposits) and not fluctuating with FX.
        // Logic:
        // 1. Sort effectiveDeposits by date (already sorted).
        // 2. Iterate and convert each deposit to Target AT THE DATE OF DEPOSIT.
        // 3. maintain running total.
        const depositHistory: { date: string, total: number }[] = [];
        let runningDepositTotal = 0;

        // Helper to find deposits on/before a date
        // But simpler: just map effectiveDeposits to their Target Value and accumulate.
        // Note: we need to handle the date alignment.

        effectiveDeposits.forEach(d => {
            let val = 0;
            // Case 1: Original currency matches Target -> Use Original Amount (Exact)
            if (d.currency === targetCurrency && d.originalAmount) {
                val = d.originalAmount;
            } else {
                // Case 2: Different currency -> Convert Base Amount to Target using Historical Rate
                // baseToTargetRates covers the simulated period.
                const r = getRateWithLookback(baseToTargetRates, d.date);
                val = d.amount * r;
            }
            runningDepositTotal += val;
            depositHistory.push({ date: d.date, total: runningDepositTotal });
        });

        // Helper to get total invested at a specific date
        // Since deposits are sparse, we find the last deposit record <= date
        const getTotalInvestedAtDate = (date: string) => {
            // Find last deposit where d.date <= date
            // Since depositHistory is sorted by date...
            let lastTotal = 0;
            for (let i = depositHistory.length - 1; i >= 0; i--) {
                if (depositHistory[i].date <= date) {
                    lastTotal = depositHistory[i].total;
                    break;
                }
            }
            return lastTotal;
        };

        const convertedComparison = comparison.map(p => {
            // 1. Convert Benchmark (USD -> Target)
            let bRate = 1;
            if (targetCurrency !== 'USD') {
                // Try exact match, else use last known
                if (usdToTargetRates.has(p.date)) {
                    bRate = usdToTargetRates.get(p.date)!;
                    lastUsdToTarget = bRate;
                } else {
                    bRate = lastUsdToTarget;
                    // If still 1 (and strictly not USD), maybe try lookback for very first point?
                    if (bRate === 1 && usdToTargetRates.size > 0) {
                        bRate = getRateWithLookback(usdToTargetRates, p.date);
                        lastUsdToTarget = bRate;
                    }
                }
            }

            // 2. Convert Portfolio (Base -> Target)
            let pRate = 1;
            if (detectedBaseCurrency !== targetCurrency) {
                if (baseToTargetRates.has(p.date)) {
                    pRate = baseToTargetRates.get(p.date)!;
                    lastBaseToTarget = pRate;
                } else {
                    pRate = lastBaseToTarget;
                    if (pRate === 1 && baseToTargetRates.size > 0) {
                        pRate = getRateWithLookback(baseToTargetRates, p.date);
                        lastBaseToTarget = pRate;
                    }
                }
            }

            // 3. Get accurate Total Invested in Target
            const accurateTotalInvested = getTotalInvestedAtDate(p.date);

            return {
                date: p.date,
                benchmarkValue: p.benchmarkValue * bRate,
                portfolioValue: p.portfolioValue * pRate,
                totalInvested: accurateTotalInvested // Use calculated historical cost
            };
        });

        if (convertedComparison.length > 0) {
            const lastPoint = convertedComparison[convertedComparison.length - 1];
            logToFile(`[DEBUG] Sample conversion for last point(${lastPoint.date}): Benchmark = ${lastPoint.benchmarkValue.toFixed(2)} ${targetCurrency}, Portfolio = ${lastPoint.portfolioValue.toFixed(2)} ${targetCurrency} `);
        }


        // 8. Categories & Data Enrichment
        // A. Collect all primary symbols
        const uniqueSymbols = Array.from(new Set(latestOpenPositions.map(p => p.symbol)));
        const primaryEquitySymbols = uniqueSymbols.filter(s => !['USD', 'SGD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'JPY', 'KRW', 'CASH'].includes(s));

        // B. First Pass: Fetch data for primary holdings (Stocks & ETFs)
        let primaryData: Record<string, EnhancedSymbolData> = {};
        try {
            primaryData = await getEnhancedStockData(primaryEquitySymbols);
        } catch (e) {
            console.error("Failed to fetch primary enhanced data:", e);
        }

        // C. Identify ETF Holdings that need look-through
        // We want to fetch sector data for the *holdings* of these ETFs to fill in gaps if sectorWeightings are missing,
        // or just to provide Ticker breakdown.
        const secondarySymbols = new Set<string>();
        Object.values(primaryData).forEach(data => {
            if (data.topHoldings) {
                data.topHoldings.forEach(h => {
                    // We need to fetch data for these holdings to know their sector/industry
                    secondarySymbols.add(h.symbol);
                });
            }
        });

        // Filter out symbols we already have
        const newSecondarySymbols = Array.from(secondarySymbols).filter(s => !primaryData[s] && !['USD', 'SGD'].includes(s));

        // D. Second Pass: Fetch data for ETF underlying holdings
        let secondaryData: Record<string, EnhancedSymbolData> = {};
        if (newSecondarySymbols.length > 0) {
            try {
                secondaryData = await getEnhancedStockData(newSecondarySymbols);
            } catch (e) {
                console.error("Failed to fetch secondary enhanced data:", e);
            }
        }

        // Merge data sources
        const allEnhancedData = { ...primaryData, ...secondaryData };
        // --- Aggregation Logic ---
        const categories = calculateAllocations(latestOpenPositions, allEnhancedData);

        // [DEBUG] Log Discrepancy Investigation
        // Hoist Net Worth Calculation for debugging
        const lastNav = [...uniqueEquityMap.values()].pop();
        const netWorthBase = lastNav || latestOpenPositions.reduce((sum, p) => sum + p.value, 0);

        const totalAssetValue = categories.asset.reduce((sum, item) => sum + item.value, 0);
        logToFile(`[ALLOCATION_DEBUG] Total Asset Value from Categories: ${totalAssetValue} (Target Currency Base? No, this is Base usually)`);
        logToFile(`[ALLOCATION_DEBUG] Net Worth (Base): ${netWorthBase}`);
        logToFile(`[ALLOCATION_DEBUG] Asset Breakdown: ${JSON.stringify(categories.asset)}`);

        // Log individual position values if sum mismatch
        if (Math.abs(totalAssetValue - netWorthBase) > 100) {
            const posSum = latestOpenPositions.reduce((sum, p) => sum + p.value, 0);
            logToFile(`[ALLOCATION_DEBUG] OpenPositions Sum: ${posSum}`);
            logToFile(`[ALLOCATION_DEBUG] Comparison: AssetVal=${totalAssetValue} vs NetWorth=${netWorthBase} vs PosSum=${posSum}`);
        }

        // Final Rates for Summary (Latest)
        let endBaseToTarget = 1;
        if (detectedBaseCurrency !== targetCurrency) {
            if (comparison.length > 0) {
                const lastDate = comparison[comparison.length - 1].date;
                endBaseToTarget = getRateWithLookback(baseToTargetRates, lastDate);
                logToFile(`[DEBUG] Summary Rate Base -> Target for ${lastDate}: ${endBaseToTarget} `);
            } else {
                // fetch spot logic (existing)
                const r = await getHistoricalFxRates(detectedBaseCurrency, targetCurrency, new Date(Date.now() - 86400000 * 5), new Date());
                if (r.length > 0) endBaseToTarget = r[r.length - 1].rate;
            }
        }

        let endUsdToTarget = 1;
        if (targetCurrency !== 'USD') {
            if (comparison.length > 0) {
                const lastDate = comparison[comparison.length - 1].date;
                endUsdToTarget = getRateWithLookback(usdToTargetRates, lastDate);
                logToFile(`[DEBUG] Summary Rate USD -> Target for ${lastDate}: ${endUsdToTarget} `);
            }
        }

        // Convert Categories to Target Currency
        if (categories && endBaseToTarget !== 1) {
            ['asset', 'sector', 'geo', 'ticker'].forEach(key => {
                // @ts-ignore
                if (categories[key]) {
                    // @ts-ignore
                    categories[key] = categories[key].map((item: any) => ({
                        ...item,
                        value: item.value * endBaseToTarget
                    }));
                }
            });
        }

        // --- FX Rates for Cash Positions (Native Currency → Target) ---
        // Cash positions may have value in their native currency (e.g., SGD cash = SGD value),
        // but the API assumed all values were in base currency. We need to properly convert.
        const cashCurrencyToTargetRates = new Map<string, number>();
        const cashCurrencySymbols = ['USD', 'SGD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'JPY', 'KRW'];

        // Identify unique cash currencies that need conversion
        const uniqueCashCurrencies = new Set<string>();
        latestOpenPositions.forEach(p => {
            if (p.assetCategory === 'CASH' || cashCurrencySymbols.includes(p.symbol)) {
                const nativeCurrency = p.currency || p.symbol;
                if (nativeCurrency !== targetCurrency) {
                    uniqueCashCurrencies.add(nativeCurrency);
                }
            }
        });

        // Fetch FX rates for each unique cash currency → target
        for (const curr of Array.from(uniqueCashCurrencies)) {
            if (curr === targetCurrency) {
                cashCurrencyToTargetRates.set(curr, 1);
            } else {
                try {
                    const rates = await getHistoricalFxRates(curr, targetCurrency, new Date(Date.now() - 86400000 * 7), new Date());
                    if (rates.length > 0) {
                        cashCurrencyToTargetRates.set(curr, rates[rates.length - 1].rate);
                        logToFile(`[DEBUG] Cash FX Rate ${curr} -> ${targetCurrency}: ${rates[rates.length - 1].rate}`);
                    } else {
                        logToFile(`[WARN] No FX rate found for Cash: ${curr} -> ${targetCurrency}. Using 1.0`);
                        cashCurrencyToTargetRates.set(curr, 1);
                    }
                } catch (e) {
                    logToFile(`[ERROR] Failed to fetch Cash FX rate for ${curr} -> ${targetCurrency}: ${e}`);
                    cashCurrencyToTargetRates.set(curr, 1);
                }
            }
        }



        // Ensure FX rates exist for all deposit dates
        // If the 'Report Dates' (EquitySummary) has gaps, baseToTargetRates might identify dates for reports, but not for random deposit days.
        // We need to ensure we have rates for every deposit date.
        if (effectiveDeposits.length > 0 && detectedBaseCurrency !== targetCurrency) {
            const missingDates = effectiveDeposits
                .map(d => d.date)
                .filter(date => !baseToTargetRates.has(date) && getRateWithLookback(baseToTargetRates, date) === 1); // Check if lookback also fails/defaults to 1 (meaning no nearby data)

            if (missingDates.length > 0) {
                const sortedDates = missingDates.sort();
                const start = new Date(sortedDates[0]);
                const end = new Date(sortedDates[sortedDates.length - 1]);
                // Buffer to ensure lookback works
                start.setDate(start.getDate() - 7);
                end.setDate(end.getDate() + 2);

                logToFile(`[FX] Backfilling rates for ${missingDates.length} deposits from ${start.toISOString()} to ${end.toISOString()}`);
                const rates = await getHistoricalFxRates(detectedBaseCurrency, targetCurrency, start, end);

                let addedCount = 0;
                rates.forEach(r => {
                    // Ensure r.date is a Date object
                    const dateObj = new Date(r.date);
                    const dStr = dateObj.toISOString().split('T')[0];
                    if (!baseToTargetRates.has(dStr)) {
                        baseToTargetRates.set(dStr, r.rate);
                        addedCount++;
                    }
                });
                logToFile(`[DEBUG] Backfilled FX rates map. Added ${addedCount} new rates.`);
            }
        }

        // Use the last recorded NAV from Equity Summary as the authoritative Net Worth
        // Summing positions often misses accruals, dividends receivable, or complex cash balances.
        // const lastNav ... (Hoisted)
        // const netWorthBase ... (Hoisted)

        // Create explicit verification data for frontend (in Target Currency)
        const verificationDeposits = effectiveDeposits.map(d => {
            let rate = 1;
            // Case 1: Original currency matches Target -> Use Original Amount (Exact)
            // But 'd.amount' is in Base.
            if (d.currency === targetCurrency && d.originalAmount) {
                // Perfect match
                return { ...d, amount: d.originalAmount };
            }

            // Case 2: Convert Base -> Target
            if (detectedBaseCurrency !== targetCurrency) {
                // Use the rate map we built
                const r = getRateWithLookback(baseToTargetRates, d.date);
                rate = r;
            }

            return {
                ...d,
                amount: d.amount * rate
            };
        });

        return NextResponse.json({
            comparison: convertedComparison,
            summary: {
                netWorth: netWorthBase * endBaseToTarget,
                totalDeposited: convertedComparison.length > 0 ? convertedComparison[convertedComparison.length - 1].totalInvested : 0,
                benchmarkValue: comparisonBase.length > 0 ? (comparisonBase[comparisonBase.length - 1].benchmarkValue * endUsdToTarget) : 0
            },
            holdings: latestOpenPositions.map(p => {
                const isCash = p.assetCategory === 'CASH' || p.symbol === 'CASH' || ['USD', 'SGD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'JPY', 'KRW'].includes(p.symbol);
                const nativeCurrency = p.currency || p.symbol;

                // For stocks: always use base→target conversion
                // For cash: determine if value is already in base currency or still in native currency
                // 
                // Cash positions from granular cash reports have:
                //   - value = quantity * rateToBase (already in base currency)
                //   - For non-base currency: value !== quantity
                //   - For base currency: value === quantity
                //
                // Cash positions from original data (no granular processing) have:
                //   - value = quantity (still in native currency)
                //
                // Detection: If cash currency !== base AND value ≈ quantity, it's native (not converted)
                let conversionRate = endBaseToTarget;

                if (isCash) {
                    const isNativeCurrencyDifferentFromBase = nativeCurrency !== detectedBaseCurrency;
                    const valueEqualsQuantity = Math.abs(p.value - p.quantity) < 0.01;

                    // If value ≈ quantity AND currency differs from base, value is in native currency
                    // So we need native→target conversion
                    const valueIsInNativeCurrency = isNativeCurrencyDifferentFromBase && valueEqualsQuantity;

                    if (nativeCurrency === targetCurrency && valueIsInNativeCurrency) {
                        // Native currency matches target, no conversion needed
                        conversionRate = 1;
                    } else if (valueIsInNativeCurrency) {
                        // Value is in native currency, convert native→target
                        conversionRate = cashCurrencyToTargetRates.get(nativeCurrency) || 1;
                    } else {
                        // Value is already in base currency (from granular processing), use base→target
                        conversionRate = endBaseToTarget;
                    }
                }

                return {
                    ...p,
                    symbol: p.symbol === 'CSSPXz' ? 'CSPX.L' : p.symbol,
                    value: p.value * conversionRate, // Display in Target
                    costBasisMoney: p.costBasisMoney * conversionRate, // Display in Target
                    markPrice: p.markPrice, // Keep in Native (e.g. CAD, USD)
                    costBasisPrice: p.costBasisPrice, // Keep in Native (e.g. CAD, USD)
                    currency: p.currency, // Native currency (e.g. CAD)
                    displayCurrency: targetCurrency // Target currency (e.g. SGD) for Value/TotalCost
                };
            }),
            // Verification Data
            verificationData: convertedComparison.map(c => ({
                date: c.date,
                portfolioValue: c.portfolioValue,
                benchmarkValue: c.benchmarkValue,
                totalInvested: c.totalInvested
            })),
            deposits: verificationDeposits,

            categories: categories,
            warnings,
            baseCurrency: detectedBaseCurrency,
            targetCurrency: targetCurrency
        });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
