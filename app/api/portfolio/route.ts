
import { NextResponse } from 'next/server';
import { fetchFlexReport } from '@/lib/ibkr/api';
import { parseIBKRXml, CashTransaction, OpenPosition, EquitySummary, CashReport } from '@/lib/ibkr-parser';
import { getHistoricalFxRates } from '@/lib/finance/fx-rates';
import { getHistoricalPrices, getEnhancedStockData, EnhancedSymbolData } from '@/lib/yahoo-finance';
import { calculateComparison } from '@/lib/calculation-engine';
import { processTransactions } from '@/lib/portfolio/transaction-processor';
import { calculateAllocations } from '@/lib/portfolio/allocator';

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'debug_log.txt');

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

        let allCashTransactions: CashTransaction[] = [];
        let allEquitySummary: EquitySummary[] = [];
        let latestOpenPositions: OpenPosition[] = [];
        let latestCashReports: CashReport[] = [];
        let detectedBaseCurrency = 'USD'; // Will be updated from parsing

        // 1. Process Manual History first (if any)
        if (Array.isArray(manualHistory)) {
            let maxDateStr = '';

            manualHistory.forEach((fileData: any) => {
                if (fileData.cashTransactions) {
                    allCashTransactions = [...allCashTransactions, ...fileData.cashTransactions];
                }
                if (fileData.equitySummary) {
                    allEquitySummary = [...allEquitySummary, ...fileData.equitySummary];
                }

                // Smartly determine if this file contains the "latest" positions
                // We trust the explicitly parsed 'toDate' if available, otherwise fallback to max equity summary date

                // Smartly determine if this file contains the "latest" positions
                // We trust the explicitly parsed 'toDate' if available, otherwise fallback to max equity summary date
                let fileDate = fileData.toDate || '';

                if (!fileDate && fileData.equitySummary && fileData.equitySummary.length > 0) {
                    // Find max date in equity summary
                    const dates = fileData.equitySummary.map((e: any) => e.reportDate).sort();
                    fileDate = dates[dates.length - 1];
                }

                // If this file has open positions and its date is later than what we've seen so far, use it
                if (fileData.openPositions && fileData.openPositions.length > 0) {
                    // Simple string comparison for YYYY-MM-DD works
                    if (fileDate >= maxDateStr) {
                        maxDateStr = fileDate;
                        latestOpenPositions = fileData.openPositions;
                        latestCashReports = fileData.cashReports || [];
                    }
                }

                // Capture base currency from latest file if available
                if (fileData.baseCurrency) {
                    detectedBaseCurrency = fileData.baseCurrency;
                }
            });
        }

        // 2. Fetch Live Reports (if credentials provided)
        if (token && queryId) {
            const queryIds = queryId.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);

            for (const qId of queryIds) {
                try {
                    const xmlData = await fetchFlexReport(token, qId);
                    const parsedData = parseIBKRXml(xmlData);

                    allCashTransactions = [...allCashTransactions, ...parsedData.cashTransactions];
                    if (parsedData.equitySummary) {
                        allEquitySummary = [...allEquitySummary, ...parsedData.equitySummary];
                    }
                    latestOpenPositions = parsedData.openPositions;
                    if (parsedData.cashReports) latestCashReports = parsedData.cashReports;
                    if (parsedData.baseCurrency) detectedBaseCurrency = parsedData.baseCurrency;

                } catch (err) {
                    console.error(`Error fetching / parsing query ${qId}: `, err);
                    // If manual history exists, allow partial failure
                    if (allCashTransactions.length === 0 && allEquitySummary.length === 0) throw err;
                }
            }
        }

        // If no data was provided at all (neither manual nor live), then return an error.
        if (allCashTransactions.length === 0 && allEquitySummary.length === 0 && latestOpenPositions.length === 0) {
            return NextResponse.json({ error: 'No data provided from manual history or live reports.' }, { status: 400 });
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

        // 3. Process Transactions (Deduplicate, Gap Detection, Deposits, Lag)
        const { effectiveDeposits, uniqueEquityMap, warnings } = processTransactions(allCashTransactions, allEquitySummary);


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
                logToFile(`[DEBUG] ${detectedBaseCurrency} -> ${targetCurrency} Rates: ${rates.length} found.Sample: ${JSON.stringify(rates[0])} `);
                rates.forEach(r => baseToTargetRates.set(r.date, r.rate));
            }
        }

        // Apply Conversion
        // Helper to find rate with lookback
        const getRateWithLookback = (map: Map<string, number>, dateStr: string, days = 5): number => {
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

        const netWorthBase = latestOpenPositions.reduce((sum, p) => sum + p.value, 0) || ([...uniqueEquityMap.values()].pop() || 0);

        return NextResponse.json({
            comparison: convertedComparison,
            summary: {
                netWorth: netWorthBase * endBaseToTarget,
                totalDeposited: convertedComparison.length > 0 ? convertedComparison[convertedComparison.length - 1].totalInvested : 0,
                benchmarkValue: comparisonBase.length > 0 ? (comparisonBase[comparisonBase.length - 1].benchmarkValue * endUsdToTarget) : 0
            },
            holdings: latestOpenPositions.map(p => ({
                ...p,
                symbol: p.symbol === 'CSSPXz' ? 'CSPX.L' : p.symbol,
                value: p.value * endBaseToTarget, // Display in Target (SGD)
                costBasisMoney: p.costBasisMoney * endBaseToTarget, // Display in Target (SGD)
                markPrice: p.markPrice, // Keep in Native (e.g. CAD, USD)
                costBasisPrice: p.costBasisPrice, // Keep in Native (e.g. CAD, USD)
                currency: p.currency, // Native currency (e.g. CAD)
                displayCurrency: targetCurrency // Target currency (e.g. SGD) for Value/TotalCost
            })),
            categories,
            debugDeposits: effectiveDeposits.map(d => {
                let amount = d.amount * endUsdToTarget; // Convert Base (USD) to Target
                // If original currency matches target, use precise original amount
                if (d.currency === targetCurrency && d.originalAmount) {
                    amount = d.originalAmount;
                }
                return {
                    ...d,
                    amount,
                    currency: d.currency // Ensure currency helps frontend hide original if needed
                };
            }),
            warnings,
            baseCurrency: detectedBaseCurrency,
            targetCurrency: targetCurrency
        });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
