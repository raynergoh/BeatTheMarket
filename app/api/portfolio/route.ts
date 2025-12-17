
import { NextResponse } from 'next/server';
import { fetchFlexReport } from '@/lib/ibkr/api';
import { IbkrProvider } from '@/src/core/parser/ibkr-provider';
import { PortfolioMerger } from '@/src/core/utils/portfolio-merger';
import { UnifiedPortfolio, Asset, Deposit } from '@/src/core/types';
import { getHistoricalFxRates } from '@/lib/finance/fx-rates';
import { getHistoricalPrices, getEnhancedStockData } from '@/lib/yahoo-finance';
import { calculateComparison } from '@/src/core/engine/benchmark';
import { getRateWithLookback } from '@/src/core/engine/currency';
import { calculateAllocations } from '@/lib/portfolio/allocator';

import * as fs from 'fs';
import * as path from 'path';
import { AssetFactory } from '@/src/core/parser/asset-factory'; // Added missing import

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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, queryId, manualHistory, targetCurrency = 'USD' } = body;

        logToFile(`--- API CALL START: Target=${targetCurrency} ---`);

        // 1. Ingest Step: Collect UnifiedPortfolios from all sources
        let portfolios: UnifiedPortfolio[] = [];
        const ibkrProvider = new IbkrProvider();

        // A. Manual History
        if (Array.isArray(manualHistory)) {
            // manualHistory contains raw parsed JSON objects (ParsedFlexReport structure)?
            // Or XML strings?
            // The frontend usually sends the PARSED object if it was parsed client-side or previously?
            // Wait, existing `route.ts` treated `manualHistory` as `processedFiles` (ParsedFlexReport).
            // line 42: `processedFiles = [...manualHistory];`
            // `IbkrProvider.parse` expects XML string.
            // If `manualHistory` is already parsed objects, `IbkrProvider.parse` won't work on them.
            // `IbkrProvider` expects generic input? No, `parse(xmlContent: string)`.
            // Check frontend `settings-dialog.tsx`:
            // It likely saves the parsed JSON to localStorage.
            // If so, I need an adapter to convert `ParsedFlexReport` (JSON) -> `UnifiedPortfolio`.
            // OR I just map it manually here.
            // `IbkrProvider` logic is mostly "Map ParsedReport -> Unified".
            // I should extract the mapping logic from `IbkrProvider` into a static helper `mapParsedReportToUnified`?
            // And `parse` calls that helper.
            // If I can't easily change `IbkrProvider` now (I can, it's my code), I will do that.
            // Let's assume I need to support already-parsed JSON.

            // Quick fix: Add `fromParsed(report: any): UnifiedPortfolio` to IbkrProvider or just instantiate logic here?
            // Cleaner: Add static method to IbkrProvider.

            // For now, I will treat `manualHistory` objects carefully.
            // If they look like parsed reports, I need to convert them.
            // Existing `route.ts` just merged them.
            // I'll add logic to convert them.
        }

        // B. Live Reports
        if (token && queryId) {
            const queryIds = queryId.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
            for (const qId of queryIds) {
                try {
                    const xmlData = await fetchFlexReport(token, qId);
                    const unified = ibkrProvider.parse(xmlData);
                    // Add filename equivalent to metadata if needed
                    unified.metadata.provider = `IBKR-Live-${qId}`;
                    portfolios.push(unified);
                } catch (err) {
                    console.error(`Error fetching / parsing query ${qId}: `, err);
                    logToFile(`Error fetching query ${qId}: ${err}`);
                }
            }
        }

        // Handle Manual History (JSON objects)
        if (Array.isArray(manualHistory)) {
            // We need to convert these "Old Parsed Objects" to "UnifiedPortfolio".
            // Since they match `ParsedFlexReport` interface (mostly), we can feed them to a new helper in IbkrProvider?
            // Or genericize IbkrProvider to accept Object?
            // I'll manually map them here to save time on modifying Provider class again.
            // They have: cashTransactions, openPositions, equitySummary...
            // This matches `ParsedFlexReport`.
            // I can instantiate my factory logic.
            // Actually, I should update `IbkrProvider` to have `enrich(report: ParsedFlexReport): UnifiedPortfolio`.
            // I will do inline mapping reusing `IbkrProvider` logic logic patterns.

            // Dynamic import of Factory?
            // AssetFactory is imported.
            const manualPortfolios = manualHistory.map((report: any) => {
                // Check if it has the required fields
                // Reuse IbkrProvider logic...
                // This is duplicate code. 
                // It's better to modify IbkrProvider to expose `mapToUnified(report: ParsedFlexReport)`.
                // I will assume for this step I will refactor `IbkrProvider` to have `mapToUnified`.
                // BUT I can't do that inside `write_to_file`.
                // So I will defer that change and write the `manual` loop here.

                const assets = (report.openPositions || []).map((p: any) => {
                    // Check if AssetFactory needs modifying? import 'AssetFactory'
                    // We need to import AssetFactory in route.ts!
                    // I did not import it in the file content above. 
                    // I MUST add `import { AssetFactory } from '@/src/core/parser/asset-factory';`
                    return AssetFactory.createFromIbkr(p);
                    // CommonJS require in TS module? No.
                    // I will add the import to the top block.
                });

                // Reuse granular cash logic?
                if (report.cashReports && report.cashReports.length > 0) {
                    // ... splice/push logic ...
                    // This is gettting messy. 
                    // I SHOULD have refactored IbkrProvider to be usable with JSON.
                    // I will proceed with just basic mapping and accept I might miss granular cash for manual history for now?
                    // Or copy-paste the granular logic.
                }

                // Mapping Equity History
                const equityHistory = report.equitySummary ? report.equitySummary.map((e: any) => ({
                    date: e.reportDate,
                    nav: e.total
                })) : [];

                // Mapping CashFlows
                // Note: Old manual history might not have 'isNetInvestedFlow' pre-calculated if it was saved long ago?
                // `processTransactions` in `cash-flows.ts` sets it.
                // If manualHistory was saved with OLD parser instructions, it might be missing fields.
                // This is a risk.
                // If `isNetInvestedFlow` is missing, we default to All Deposits?
                // Safe assumption: If I re-parse the raw XML it would be fine. But I only have the JSON.
                // If JSON lacks `isNetInvestedFlow`, I'm in trouble.
                // BUT: The frontend `manualHistory` usually comes from `localForage` stores which store... 
                // The outputs of `parseFlexReport`.
                // Any NEW parsing will have the flag. OLD data might not.
                // If OLD data, `filter(t => t.isNetInvestedFlow)` returns empty.
                // I should check if `type` implies deposit.

                const cashFlows = (report.cashTransactions || [])
                    .filter((t: any) => t.isNetInvestedFlow || (t.type === 'Deposits/Withdrawals' && ['Deposit', 'Withdrawal', 'Electronic Fund Transfer'].some(k => t.description?.includes(k))) || t.type === 'Transfer')
                    .map((t: any) => ({
                        date: t.date,
                        amount: t.amount,
                        type: (t.amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL') as 'DEPOSIT' | 'WITHDRAWAL',
                        currency: t.currency,
                        id: t.transactionId,
                        description: t.description,
                        originalAmount: t.amount,
                        originalCurrency: t.currency
                    }));

                // 3b. Enhance with Granular Cash Reports if available in manual history
                if (report.cashReports && report.cashReports.length > 0) {
                    // Deduplicate generic cash
                    const genericCashIndex = assets.findIndex((a: Asset) => a.assetClass === 'CASH' && (a.symbol === 'CASH' || a.symbol === report.baseCurrency));
                    if (genericCashIndex >= 0) {
                        assets.splice(genericCashIndex, 1);
                    }

                    report.cashReports.forEach((cr: any) => {
                        if (Math.abs(cr.totalCash) > 0.01) {
                            assets.push({
                                symbol: cr.currency,
                                description: `Cash (${cr.currency})`,
                                assetClass: 'CASH',
                                quantity: cr.totalCash,
                                marketValue: cr.totalCash,
                                currency: cr.currency,
                                originalCurrency: cr.currency,
                                getCollateralValue: () => cr.totalCash
                            });
                        }
                    });
                }
                // Infer baseCurrency: Use EquitySummary.currency as the source of truth.
                // EquitySummaryInBase is ALWAYS reported in the account's base currency.
                // Fall back to report.baseCurrency, then 'USD' only as last resort.
                let inferredBaseCurrency = report.baseCurrency || 'USD';

                // Check EquitySummary for currency field (most reliable)
                if (report.equitySummary && report.equitySummary.length > 0) {
                    const eqCurrency = report.equitySummary[0].currency;
                    if (eqCurrency && eqCurrency !== inferredBaseCurrency) {
                        logToFile(`BaseCurrency Override: Using EquitySummary.currency=${eqCurrency} instead of stored=${inferredBaseCurrency}`);
                        inferredBaseCurrency = eqCurrency;
                    }
                }
                logToFile(`BaseCurrency Result: stored=${report.baseCurrency}, equitySummaryCcy=${report.equitySummary?.[0]?.currency}, final=${inferredBaseCurrency}`);

                return {
                    assets,
                    cashBalance: 0, // Recalculated by merger
                    baseCurrency: inferredBaseCurrency,
                    transactions: report.cashTransactions || [],
                    equityHistory,
                    cashFlows,
                    metadata: {
                        provider: 'IBKR-Manual',
                        asOfDate: report.toDate,
                        accountId: report.accountId
                    }
                } as UnifiedPortfolio;
            });
            portfolios.push(...manualPortfolios);
        }

        if (portfolios.length === 0) {
            return NextResponse.json({ error: 'No data provided.' }, { status: 400 });
        }

        // 2. Merge Step
        logToFile('Merging portfolios...');
        const unified = await PortfolioMerger.merge(portfolios, targetCurrency);
        logToFile(`Merged Portfolio: Found ${unified.assets.length} assets, ${unified.cashFlows.length} cash flows.`);

        // 3. Engine Step: Benchmarking
        // Need to calculate Comparison vs SPY (in Target Currency)
        const benchmarkSymbol = 'SPY';
        // Need date range
        let comparison: any[] = [];
        let benchmarkValue = 0;
        let deposits: Deposit[] = []; // Declare here

        if (unified.cashFlows.length > 0) {
            const sortedFlows = [...unified.cashFlows].sort((a, b) => a.date.localeCompare(b.date));

            // Use first equity history date as start (not first cash flow)
            // This provides apples-to-apples comparison: benchmark starts when portfolio was actually tracked
            const sortedEquity = [...unified.equityHistory].sort((a, b) => a.date.localeCompare(b.date));
            const startDate = sortedEquity.length > 0
                ? new Date(sortedEquity[0].date)
                : new Date(sortedFlows[0].date); // Fallback to cash flow if no equity history
            const endDate = new Date();

            logToFile(`[BENCHMARK DEBUG] SPY Start Date: ${startDate.toISOString().split('T')[0]} (source: ${sortedEquity.length > 0 ? 'equityHistory' : 'cashFlows'})`);

            const spyData = await getHistoricalPrices(benchmarkSymbol, startDate, endDate);

            // Normalize SPY to Target
            // We need USD -> Target rates
            let spyInTarget = spyData.map(d => ({ date: d.date, close: d.close }));
            if (targetCurrency !== 'USD') {
                const rates = await getHistoricalFxRates('USD', targetCurrency, startDate, endDate);
                const rateMap = new Map<string, number>();
                rates.forEach(r => rateMap.set(r.date, r.rate));

                // Initialize fill-forward fallback rate
                let lastKnownRate = rates.length > 0 ? rates[0].rate : 1;

                spyInTarget = spyInTarget.map(p => {
                    // 1. Try lookback first (get closest actual rate to target date)
                    const lookbackRate = getRateWithLookback(rateMap, p.date, 5);

                    let effectiveRate: number;
                    if (lookbackRate !== 1) {
                        // Lookback found a rate - use it and update fill-forward tracker
                        effectiveRate = lookbackRate;
                        lastKnownRate = lookbackRate;
                    } else {
                        // 2. Lookback failed - use fill-forward fallback
                        effectiveRate = lastKnownRate;
                    }

                    return { ...p, close: p.close * effectiveRate };
                });
            }

            // Convert CashFlows to Deposits
            // Convert CashFlows to Deposits
            deposits = unified.cashFlows.map(c => ({
                date: c.date,
                amount: c.amount,
                currency: c.originalCurrency || c.currency, // Use Original for 'currency' field to trigger 'Original' column in frontend
                type: c.type,
                transactionId: c.id,
                originalAmount: c.originalAmount,
                description: c.description || (c.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal')
            }));

            // Synthetic Initial Capital Logic
            // Detect if we have Equity History start but no corresponding initial deposit (common in older manual history or partial extracts)
            if (unified.equityHistory.length > 0) {
                // Sort Equity History by date
                const sortedEquity = [...unified.equityHistory].sort((a, b) => a.date.localeCompare(b.date));
                const firstNavPoint = sortedEquity[0];

                // Check sum of deposits on or before the first NAV date
                const depositsBeforeOrOnStart = deposits
                    .filter(d => d.date <= firstNavPoint.date)
                    .reduce((sum, d) => sum + d.amount, 0);

                // If accumulated deposits are significantly less than the starting NAV (e.g. < 90%), assume untracked initial capital
                // Exception: If the NAV itself is zero or negligible.
                if (firstNavPoint.nav > 100 && depositsBeforeOrOnStart < (firstNavPoint.nav * 0.9)) {
                    logToFile(`Detected missing initial capital. First NAV: ${firstNavPoint.nav} vs Deposits: ${depositsBeforeOrOnStart}`);

                    const syntheticAmount = firstNavPoint.nav - depositsBeforeOrOnStart;

                    // Attempt to find the Original Currency and Original Amount
                    // The firstNavPoint comes from one of the portfolios. We need to find which one.
                    // We can look at `portfolios` (input).
                    // We assume the portfolio with the earliest date matching firstNavPoint is the source.
                    let originalCurrency = targetCurrency;
                    let originalAmount = syntheticAmount;

                    // Note: 'date' in equityHistory is YYYY-MM-DD string.
                    const sourcePortfolio = portfolios.find(p => p.equityHistory && p.equityHistory.some(e => e.date === firstNavPoint.date));

                    logToFile(`Source Portfolio Search: firstNavPoint.date=${firstNavPoint.date}, found=${!!sourcePortfolio}, baseCurrency=${sourcePortfolio?.baseCurrency || 'N/A'}`);

                    if (sourcePortfolio) {
                        originalCurrency = sourcePortfolio.baseCurrency;
                        // If currencies differ, we should ideally back-calculate the Original Amount.
                        // syntheticAmount is in Target.
                        // originalAmount = syntheticAmount / Rate(Original -> Target).
                        // effectively: originalAmount = syntheticAmount * Rate(Target -> Original).
                        // BUT extracting `nav` from sourcePortfolio directly is safer?
                        const rawPoint = sourcePortfolio.equityHistory!.find(e => e.date === firstNavPoint.date);
                        if (rawPoint) {
                            // Raw Point NAV is in Base Currency of Source.
                            // But wait! `depositsBeforeOrOnStart` is subtracted in Target terms.
                            // So `syntheticAmount` (Target) = `firstNavPoint` (Target) - `Deposits` (Target).
                            // If `deposits` ~ 0, then `syntheticAmount` ~ `firstNavPoint` (Target).
                            // So `originalAmount` ~ `rawPoint.nav`.
                            // This is a good approximation if deposits are negligible.
                            // If deposits are substantial, we can't easily express "Target Shortfall" as "Original Shortfall" accurately without rate.
                            // Let's assume Rate is roughly implied by Nav/RawNav.
                            // Or fetch rate?
                            // Simple heuristic: If Deposits are 0 (likely for this case), use Raw NAV.
                            // If Deposits are non-zero, use Raw NAV * (Shortfall % of NAV).
                            const ratio = (firstNavPoint.nav > 0) ? (syntheticAmount / firstNavPoint.nav) : 1;
                            originalAmount = rawPoint.nav * ratio;
                        }
                    }

                    const syntheticDeposit: Deposit = {
                        date: firstNavPoint.date,
                        amount: syntheticAmount,
                        currency: originalCurrency, // Set to Original Currency (e.g. SGD) to trigger frontend display
                        type: 'Synthetic',
                        description: `Synthetic Initial Capital (Derived from NAV on ${firstNavPoint.date})`,
                        transactionId: `SYNTH_INIT_${firstNavPoint.date}`,
                        originalCurrency: originalCurrency,
                        originalAmount: originalAmount
                    };

                    // Prepend
                    deposits.unshift(syntheticDeposit);
                }
            }

            // Benchmarking Logic: Short Option Collateral Adjustment
            // We need raw assets (or access to Original Currency) for `calculateShortPutCollateral`.
            // `unified.assets` has `getCollateralValue` closure with original data.
            // We need Rates: Original -> Target (since `synthesizeCollateralDeposit` compares with deposits in Target).
            // `calculateShortPutCollateral` expects `baseCurrency` arg. It calculates values IN BASE.
            // If we pass `targetCurrency` as `baseCurrency`, it asks for `Original -> Target` rates.
            // Safe!
            // Fetch Rates for Options.
            const optionCurrencies = new Set<string>();
            unified.assets.filter(a => a.assetClass === 'OPTION').forEach(a => {
                // We need original currency. But we lost it in `UnifiedPortfolio.assets` (overwritten to Target).
                // `getCollateralValue` uses captured `p.currency`.
                // We can't know `p.currency` from `a` anymore.
                // WE NEED TO FETCH RATES FOR ALL POTENTIAL CURRENCIES? 
                // Or we iterate `portfolios` (source) to find option currencies?
                // Or we assume standard majors.
                // Or we update `PortfolioMerger` to preserve `originalCurrency`.
                // I will update `PortfolioMerger` (Step 4c was done, but I missed this).
                // Workaround: Loop through `portfolios` (inputs) to collect Option Currencies.
            });

            portfolios.forEach(p => {
                p.assets.forEach(a => {
                    if (a.assetClass === 'OPTION') optionCurrencies.add(a.currency);
                });
            });

            const optionRates = new Map<string, number>();
            for (const c of Array.from(optionCurrencies)) {
                const r = await getHistoricalFxRates(c, targetCurrency, new Date(Date.now() - 86400000 * 5), new Date());
                if (r.length > 0) optionRates.set(c, r[r.length - 1].rate);
            }

            // Benchmark uses pure deposits (no synthetic collateral adjustment)
            const depositsSum = deposits.reduce((sum, d) => sum + d.amount, 0);
            logToFile(`[BENCHMARK DEBUG] Deposits Sum: ${depositsSum.toFixed(2)} ${targetCurrency}`);
            logToFile(`[BENCHMARK DEBUG] First Deposit Date: ${deposits.length > 0 ? deposits[0].date : 'N/A'}`);
            logToFile(`[BENCHMARK DEBUG] First SPY Price: ${spyInTarget.length > 0 ? spyInTarget[0].close.toFixed(2) : 'N/A'} (Date: ${spyInTarget.length > 0 ? spyInTarget[0].date : 'N/A'})`);
            logToFile(`[BENCHMARK DEBUG] Last SPY Price: ${spyInTarget.length > 0 ? spyInTarget[spyInTarget.length - 1].close.toFixed(2) : 'N/A'} (Date: ${spyInTarget.length > 0 ? spyInTarget[spyInTarget.length - 1].date : 'N/A'})`);

            comparison = calculateComparison(deposits, spyInTarget);

            if (comparison.length > 0) {
                benchmarkValue = comparison[comparison.length - 1].benchmarkValue;
                logToFile(`[BENCHMARK DEBUG] Final Benchmark Value: ${benchmarkValue.toFixed(2)} ${targetCurrency}`);
            }

            // 4. Fill Forward Portfolio Value (Verification Data)
            // unified.equityHistory has sparse data.
            // We want a daily (or aligned) char.
            // `comparison` has daily points (from Spy Data).
            // Align Portfolio Value to Comparison Dates.

            let lastNav = 0;
            const equityMap = new Map<string, number>();
            unified.equityHistory.forEach(e => equityMap.set(e.date, e.nav));

            const verificationData = comparison.map(point => {
                const nav = equityMap.get(point.date);
                if (nav !== undefined) lastNav = nav;

                // If missing NAV, do we add pending deposits?
                // `route.ts` old logic: "pendingDeposits += dayDeposits".
                // Simplify: just use Last NAV.
                return {
                    ...point,
                    portfolioValue: lastNav // Simplified Fill Forward
                };
            });

            // 5. Allocations
            // unified.assets are in Target Currency.
            const uniqueSymbols = Array.from(new Set(unified.assets.map(a => a.symbol)));
            const enhancedData = await getEnhancedStockData(uniqueSymbols);
            const categories = calculateAllocations(unified.assets, enhancedData);

            // Calculate Net Worth for use in holdings % calculation
            const computedNetWorth = unified.cashBalance + unified.assets.reduce((s, a) => s + a.marketValue, 0);

            return NextResponse.json({
                comparison: verificationData,
                summary: {
                    netWorth: computedNetWorth,
                    totalDeposited: verificationData.length > 0 ? verificationData[verificationData.length - 1].totalInvested : 0,
                    benchmarkValue: benchmarkValue
                },
                holdings: unified.assets.map(a => ({
                    ...a,
                    value: a.marketValue, // formatted for frontend (in target currency)
                    currency: a.originalCurrency || a.currency, // Native currency for Price/AvgCost display
                    displayCurrency: targetCurrency, // Target currency for Value/CostBasis display
                    costBasisMoney: a.costBasis,
                    // Use original per-share prices (in native currency)
                    markPrice: a.originalMarkPrice || (a.quantity ? (a.marketValue / a.quantity) : 0),
                    costBasisPrice: a.originalCostBasisPrice || ((a.quantity && a.costBasis) ? (a.costBasis / a.quantity) : 0),
                    percentOfNAV: computedNetWorth > 0 ? (a.marketValue / computedNetWorth) * 100 : 0
                })),
                categories,
                baseCurrency: targetCurrency,
                targetCurrency: targetCurrency,
                deposits: deposits // Pass for debug/verification dialog
            });
        }

        // No cash flows - return empty comparison
        return NextResponse.json({
            comparison: [],
            benchmarkValue: 0,
            deposits: []
        });
    } catch (error: any) {
        console.error('API Error:', error);
        logToFile(`API Error: ${error.message}`);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
