
import { UnifiedPortfolio, Asset, CashTransaction } from '../types';
import { getHistoricalFxRates } from '@/lib/finance/fx-rates';
// We assume getRateWithLookback is available or we implement it here.
// Checking imports showed it in src/core/engine/currency
import { getRateWithLookback } from '../engine/currency';

export interface MergeResult {
    portfolio: UnifiedPortfolio;
    warnings: string[];
}

export class PortfolioMerger {
    /**
     * Merges multiple UnifiedPortfolio objects into a single one.
     * Normalizes all values to the targetCurrency.
     */
    static async merge(rawPortfolios: UnifiedPortfolio[], targetCurrency: string = 'USD'): Promise<MergeResult> {
        if (rawPortfolios.length === 0) {
            return {
                portfolio: PortfolioMerger.createEmpty(targetCurrency),
                warnings: []
            };
        }

        // 0. Pre-process: Smart Consensus for Account Consolidation
        // We group by Account ID, but we must decide whether to STITCH (Merge/Overwrite) or SUM (Separate).
        // Scenarios:
        // 1. Time Extension (Year 1, Year 2) -> Stitch.
        // 2. Update/Duplicate (Year 1 v1, Year 1 v2) -> Stitch.
        // 3. Partition (Main, Options) -> Sum.

        const accountGroups = new Map<string, UnifiedPortfolio[]>();
        rawPortfolios.forEach(p => {
            const accId = p.metadata.accountId || 'UNKNOWN';
            if (!accountGroups.has(accId)) accountGroups.set(accId, []);
            accountGroups.get(accId)!.push(p);
        });

        const portfolios: UnifiedPortfolio[] = [];

        // ============================================================
        // DETERMINISTIC ID-BASED GROUPING (replaces fuzzy NAV matching)
        // ============================================================
        // Step A: Group all portfolios by Account ID
        // Step B: For same account, merge using "Latest Wins" priority
        // Step C: Different accounts are summed (kept separate)
        // ============================================================

        for (const [accId, group] of accountGroups) {
            if (group.length === 1) {
                portfolios.push(group[0]);
                continue;
            }

            // Same account with multiple files -> STITCH (never sum)
            // This handles: Manual uploads + Auto-sync, Historical + Recent, Duplicates


            // Sort by asOfDate (oldest to newest) - newest file has highest priority
            const sortedByRecency = [...group].sort((a, b) =>
                new Date(a.metadata.asOfDate).getTime() - new Date(b.metadata.asOfDate).getTime()
            );

            // The most recent file's assets are the source of truth
            const latestFile = sortedByRecency[sortedByRecency.length - 1];


            // -------------------------------------------------------
            // A. Equity History: "Latest Wins" for overlapping dates
            // -------------------------------------------------------
            // Process oldest to newest - each newer file overwrites older values
            const equityMap = new Map<string, { date: string; nav: number }>();

            for (const p of sortedByRecency) {
                if (p.equityHistory) {
                    p.equityHistory.forEach(point => {
                        // Newer file always overwrites older file for same date
                        equityMap.set(point.date, point);
                    });
                }
            }

            const consolidatedHistory = Array.from(equityMap.values())
                .sort((a, b) => a.date.localeCompare(b.date));



            // -------------------------------------------------------
            // B. Cash Flows: Deduplicate by ID (union)
            // -------------------------------------------------------
            const cashFlowMap = new Map<string, any>();
            const cashFlowsWithoutId: any[] = [];

            for (const p of sortedByRecency) {
                if (p.cashFlows) {
                    p.cashFlows.forEach(cf => {
                        if (cf.id) {
                            // Dedup by ID - latest file's version wins
                            cashFlowMap.set(cf.id, cf);
                        } else {
                            // If no ID, dedupe by date+amount+type combo
                            const key = `${cf.date}_${cf.amount}_${cf.type}`;
                            if (!cashFlowMap.has(key)) {
                                cashFlowMap.set(key, cf);
                                cashFlowsWithoutId.push(cf);
                            }
                        }
                    });
                }
            }

            const consolidatedCashFlows = Array.from(cashFlowMap.values())
                .sort((a, b) => a.date.localeCompare(b.date));



            // -------------------------------------------------------
            // C. Assets: Use ONLY the most recent file's positions
            // -------------------------------------------------------
            // Do NOT merge/sum positions from different files - use latest snapshot only
            const consolidatedAssets = latestFile.assets;


            // -------------------------------------------------------
            // D. Transactions: Union (for reference, not used in calculations)
            // -------------------------------------------------------
            const allTransactions: CashTransaction[] = [];
            const txnIds = new Set<string>();

            for (const p of sortedByRecency) {
                if (p.transactions) {
                    p.transactions.forEach(txn => {
                        const key = (txn as any).transactionId || `${txn.date}_${txn.amount}_${txn.type}`;
                        if (!txnIds.has(key)) {
                            txnIds.add(key);
                            allTransactions.push(txn);
                        }
                    });
                }
            }

            // Create the stitched portfolio for this account
            portfolios.push({
                assets: consolidatedAssets,
                cashBalance: latestFile.cashBalance, // Use latest snapshot's cash balance
                baseCurrency: latestFile.baseCurrency,
                transactions: allTransactions,
                equityHistory: consolidatedHistory,
                cashFlows: consolidatedCashFlows,
                metadata: {
                    provider: `STITCHED-${accId}`,
                    asOfDate: latestFile.metadata.asOfDate,
                    accountId: accId
                }
            });
        }

        // ============================================================
        // At this point, `portfolios` contains:
        // - One stitched portfolio per unique Account ID
        // - Different accounts will be SUMMED in the aggregation below
        // ============================================================


        // 1. Prepare Aggregators
        let mergedAssets: Asset[] = [];
        let mergedTransactions: CashTransaction[] = []; // Raw Transactions
        let mergedCashFlows: Array<{
            date: string;
            amount: number;
            type: 'DEPOSIT' | 'WITHDRAWAL';
            currency: string;
            id?: string;
            description?: string;
            originalAmount?: number;
            originalCurrency?: string;
        }> = [];
        const globalSeenIds = new Set<string>();

        // Equity History Aggregation: Date -> Total NAV (in Target Currency)
        const equityMap = new Map<string, number>();

        // Cash Balance Aggregation
        let totalCashBalance = 0;

        // 2. Determine Date Range for Bulk FX Fetching
        // We need rates for: Equity History (Daily), Cash Flows (Specific Dates).
        // Assets usually use "Latest" rate (Spot).

        let minDate = new Date(); // Start with "Now" and go back
        let maxDate = new Date(0); // Start with "Epoch" and go forward

        portfolios.forEach(p => {
            if (p.equityHistory) {
                p.equityHistory.forEach(e => {
                    const d = new Date(e.date);
                    if (d < minDate) minDate = d;
                    if (d > maxDate) maxDate = d;
                });
            }
            if (p.cashFlows) {
                p.cashFlows.forEach(c => {
                    const d = new Date(c.date);
                    if (d < minDate) minDate = d;
                    if (d > maxDate) maxDate = d;
                });
            }
        });

        // Add buffer to maxDate (Tomorrow) for safety
        maxDate = new Date(maxDate.getTime() + 86400000);
        // If minDate is still "Now" (no history), set a default
        if (minDate > maxDate) minDate = new Date(Date.now() - 86400000 * 30); // 30 days back default

        // 3. Process each Portfolio
        // We will store the rate maps used for Equity/Assets to reuse them for Cash Flows if needed
        const portfolioBaseRateMaps = new Map<number, Map<string, number>>(); // Index -> RateMap
        const portfolioLatestRates = new Map<number, number>(); // Index -> Rate

        // Let's rewrite the main loop properly using `for...of` to support await
        let pIndex = 0;
        for (const p of portfolios) {
            const base = p.baseCurrency;
            let rateMap = new Map<string, number>();
            let latestRate = 1;

            // Fetch Rates if needed
            if (base !== targetCurrency) {
                try {
                    const rates = await getHistoricalFxRates(base, targetCurrency, minDate, maxDate);
                    rates.forEach(r => rateMap.set(r.date, r.rate));
                    if (rates.length > 0) {
                        latestRate = rates[rates.length - 1].rate;
                    } else {
                        const spot = await getHistoricalFxRates(base, targetCurrency, new Date(Date.now() - 86400000 * 5), new Date());
                        if (spot.length > 0) latestRate = spot[spot.length - 1].rate;
                    }
                } catch (e) {
                    console.error(`[PortfolioMerger] Failed to fetch rates ${base}->${targetCurrency}`, e);
                }
            }

            // Store for later use
            portfolioBaseRateMaps.set(pIndex, rateMap);
            portfolioLatestRates.set(pIndex, latestRate);

            // A. Merge Cash Balance
            totalCashBalance += p.cashBalance * latestRate;

            // B. Merge Assets
            const assetCurrencies = new Set<string>();
            p.assets.forEach(a => {
                if (a.currency !== targetCurrency) assetCurrencies.add(a.currency);
            });

            const assetRates = new Map<string, number>();
            if (assetCurrencies.has(base) && base !== targetCurrency) {
                assetRates.set(base, latestRate);
                assetCurrencies.delete(base);
            }

            for (const ccy of Array.from(assetCurrencies)) {
                try {
                    const r = await getHistoricalFxRates(ccy, targetCurrency, new Date(Date.now() - 86400000 * 5), new Date());
                    assetRates.set(ccy, (r.length > 0) ? r[r.length - 1].rate : 1);
                } catch (e) {
                    assetRates.set(ccy, 1);
                }
            }

            p.assets.forEach(asset => {
                let rate = 1;
                if (asset.currency !== targetCurrency) {
                    rate = assetRates.get(asset.currency) || 1;
                }
                mergedAssets.push({
                    ...asset,
                    marketValue: asset.marketValue * rate,
                    costBasis: (asset.costBasis || 0) * rate,
                    currency: targetCurrency,
                    originalCurrency: asset.originalCurrency || asset.currency,
                    // Preserve original per-share prices (don't convert)
                    originalMarkPrice: asset.originalMarkPrice,
                    originalCostBasisPrice: asset.originalCostBasisPrice
                });
            });

            // C. Merge Equity History (Historical Rates)
            // We need to collect all raw equity histories first, then merge them properly
            // The current loop structure is: `for (const p of portfolios)`.
            // Merging efficiently requires accessing ALL portfolios for EACH date.
            // So we should just collect the raw data here, and process the merge AFTER the loop.
            mergedTransactions.push(...p.transactions);
            pIndex++;
        } // End of per-portfolio loop

        // 3b. Perform Fill-Forward Merge of Equity History
        // Step 1: Collect all unique dates from all portfolios
        const allEquityDates = new Set<string>();
        portfolios.forEach(p => {
            if (p.equityHistory) {
                p.equityHistory.forEach(pt => allEquityDates.add(pt.date));
            }
        });
        const sortedDates = Array.from(allEquityDates).sort();

        // Step 2: Iterate valid dates and sum NAVs (Filling Forward missing values)
        const lastKnownNavs = new Map<number, number>(); // PortfolioIndex -> LastNAV in Target Ccy
        // Initialize with zero
        for (let i = 0; i < portfolios.length; i++) lastKnownNavs.set(i, 0);

        sortedDates.forEach(date => {
            let dailyTotal = 0;

            // For this date, update lastKnownNavs for any portfolio that has a datapoint
            // Then sum all lastKnownNavs
            portfolios.forEach((p, idx) => {
                // Find point for this date
                // Optimization: p.equityHistory is likely sorted, but simple find is safer for now. 
                // Given manageable size (~365 points), find is okay. Map would be faster.
                // We could pre-map optimization if needed.
                const point = p.equityHistory?.find(ep => ep.date === date);

                if (point) {
                    // Convert to Target
                    const rateMap = portfolioBaseRateMaps.get(idx) || new Map<string, number>();
                    const latestRate = portfolioLatestRates.get(idx) || 1;
                    const r = getRateWithLookback(rateMap, date) || latestRate;
                    const valInTarget = point.nav * r;
                    lastKnownNavs.set(idx, valInTarget);
                }

                // Add current (or carried forward) value to total
                dailyTotal += lastKnownNavs.get(idx) || 0;
            });

            equityMap.set(date, dailyTotal);
        });

        // Current Code Structure Note:
        // The original code calculated `equityMap` INSIDE the loop. 
        // I have commented out that logic in step 3 and moved it here.
        // But I need to ensure I removed the old logic inside the loop!
        // The `replace` block starts at "C. Merge Equity History".
        // I need to confirm I am replacing the block inside the loop OR removing it.
        // Wait, the `replace_file_content` target IS inside the loop.
        // If I put "BreaK loop" logic here it will break.
        // I CANNOT change the loop structure easily with a chunk replacement if I am inside it.
        // Actually, the previous tool call showed I am inside `for (const p of portfolios)`.
        // To fix this cleanly:
        // 1. Inside the loop: Just collect the formatted history into a temp structure on `p`.
        // 2. Or, since I can't easily jump out, I will just NO-OP the equity merging inside the loop.
        // 3. AND THEN append the new logic after the loop?
        // But I can only replace one chunk.
        // Strategy: 
        // Replace the "C. Merge Equity History" block inside the loop with NOTHING (or just a comment).
        // AND THEN use a `multi_replace` or separate call to insert the new logic AFTER the loop.
        // OR better: The tool `portfolio-merger.ts` likely calculates `equityMap` outside the loop?
        // No, `equityMap` is defined outside.
        // So I can just delete the inner logic.
        // And then insert the new logic after the loop.

        // Let's look at where the loop ends.
        // Line ~170 is `mergedTransactions.push`.
        // Line ~171 is `pIndex++`.
        // Line ~172 is `}` (Loop End).

        // I will use `multi_replace` to:
        // 1. Remove the old "C. Merge Equity" update inside the loop.
        // 2. Insert the new "Fill Forward" logic AFTER the loop closure.

        // Wait, `multi_replace` is risky if I get line numbers wrong.
        // Let's use `replace_file_content` to essentially empty the "C" section inside the loop.
        // And then another call to append after.

        // BETTER PLAN:
        // I will read the file again around the loop end to get precise lines.

        // D. Merge Cash Flows (Historical Rates)
        // Deduplication Logic:
        // We use a Set of seen IDs to prevent double counting overlapping reports.

        // 1. Collect all unique currencies from all cash flows
        const flowCurrencies = new Set<string>();
        portfolios.forEach(p => {
            if (p.cashFlows) {
                p.cashFlows.forEach(cf => flowCurrencies.add(cf.currency));
            }
        });

        // 2. Fetch Rates for all identified currencies -> Target
        const flowRatesMap = new Map<string, Map<string, number>>(); // Currency -> Date -> Rate

        // The minDate and maxDate for FX fetching are already determined at the beginning
        // of the merge function, covering all cash flow dates.

        for (const currency of Array.from(flowCurrencies)) {
            if (currency === targetCurrency) continue;

            try {
                const rates = await getHistoricalFxRates(currency, targetCurrency, minDate, maxDate);
                const dateMap = new Map<string, number>();
                rates.forEach(r => dateMap.set(r.date, r.rate));
                flowRatesMap.set(currency, dateMap);
            } catch (e) {
                console.error(`[PortfolioMerger] Failed to fetch rates for cash flow ${currency}->${targetCurrency}`, e);
                // If fetching fails, we'll rely on fallbacks later
            }
        }

        // 3. Process Cash Flows using stored maps
        pIndex = 0;
        for (const p of portfolios) {
            const base = p.baseCurrency;
            const baseRateMap = portfolioBaseRateMaps.get(pIndex) || new Map<string, number>();
            const baseLatestRate = portfolioLatestRates.get(pIndex) || 1;

            if (p.cashFlows) {
                p.cashFlows.forEach(cf => {
                    // Check ID
                    if (cf.id && globalSeenIds.has(cf.id)) {
                        return; // Skip duplicate
                    }
                    if (cf.id) globalSeenIds.add(cf.id);

                    // Determine Rate
                    let rate = 1;
                    if (cf.currency !== targetCurrency) {
                        const currencyRates = flowRatesMap.get(cf.currency);
                        if (currencyRates) {
                            rate = getRateWithLookback(currencyRates, cf.date) || 1;
                        } else {
                            // Fallback to Base Rate of that portfolio if cash flow currency matches portfolio base
                            if (cf.currency === base) {
                                rate = getRateWithLookback(baseRateMap, cf.date) || baseLatestRate;
                            } else {
                                console.warn(`[PortfolioMerger] No specific FX rate found for cash flow ${cf.currency} to ${targetCurrency} on ${cf.date}. Using 1.`);
                            }
                        }
                    }

                    mergedCashFlows.push({
                        date: cf.date,
                        amount: cf.amount * rate,
                        type: cf.type,
                        currency: targetCurrency, // We normalized it
                        id: cf.id,
                        description: cf.description,
                        originalAmount: cf.originalAmount || cf.amount,
                        originalCurrency: cf.originalCurrency || cf.currency
                    });
                });
            }
            pIndex++;
        }

        // 4. Final Processing
        // Sort Equity History
        const sortedHistory = Array.from(equityMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, nav]) => ({ date, nav }));

        // Sort Cash Flows
        mergedCashFlows.sort((a, b) => a.date.localeCompare(b.date));

        // 5. Gap Detection in Equity History
        const warnings: string[] = [];
        if (sortedHistory.length > 1) {
            const isWeekend = (date: Date) => {
                const day = date.getDay();
                return day === 0 || day === 6;
            };

            const getBusinessDays = (startDate: Date, endDate: Date) => {
                let count = 0;
                const cur = new Date(startDate);
                cur.setDate(cur.getDate() + 1);
                while (cur < endDate) {
                    if (!isWeekend(cur)) {
                        count++;
                    }
                    cur.setDate(cur.getDate() + 1);
                }
                return count;
            };

            for (let i = 0; i < sortedHistory.length - 1; i++) {
                const currentDate = new Date(sortedHistory[i].date);
                const nextDate = new Date(sortedHistory[i + 1].date);

                const diffTime = Math.abs(nextDate.getTime() - currentDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > 2) {
                    const missingBusinessDays = getBusinessDays(currentDate, nextDate);
                    // Warn if more than 2 business days missing (allows for holidays)
                    if (missingBusinessDays > 2) {
                        warnings.push(`Data Gap Detected: No records between ${sortedHistory[i].date} and ${sortedHistory[i + 1].date} (${missingBusinessDays} missing business days).`);
                    }
                }
            }
        }

        return {
            portfolio: {
                assets: mergedAssets,
                cashBalance: totalCashBalance,
                baseCurrency: targetCurrency,
                transactions: mergedTransactions,
                equityHistory: sortedHistory,
                cashFlows: mergedCashFlows,
                metadata: {
                    provider: 'MERGED',
                    asOfDate: new Date().toISOString().split('T')[0],
                    accountId: 'ALL'
                }
            },
            warnings
        };
    }

    static createEmpty(currency: string): UnifiedPortfolio {
        return {
            assets: [],
            cashBalance: 0,
            baseCurrency: currency,
            transactions: [],
            equityHistory: [],
            cashFlows: [],
            metadata: { provider: 'EMPTY', asOfDate: '', accountId: '' }
        };
    }
}
