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
     * Generate composite key to ensure account IDs are unique within provider context.
     * This prevents collisions like IBKR-12345 vs SCHWAB-12345.
     */
    private static getCompositeKey(portfolio: UnifiedPortfolio): string {
        const provider = portfolio.metadata.provider || 'UNKNOWN_PROVIDER';
        const accountId = portfolio.metadata.accountId || 'UNKNOWN_ACCOUNT';
        return `${provider}::${accountId}`;
    }

    /**
     * Two-Phase Merge:
     * Phase 1: Stitch portfolios with same provider+accountId (time-series extension)
     * Phase 2: Sum all unique accounts into one master portfolio
     */
    static async merge(rawPortfolios: UnifiedPortfolio[], targetCurrency: string = 'USD'): Promise<MergeResult> {
        if (rawPortfolios.length === 0) {
            return {
                portfolio: PortfolioMerger.createEmpty(targetCurrency),
                warnings: []
            };
        }

        // PHASE 1: STITCHING - Group by Composite Key (provider::accountId)
        const stitchedPortfolios = await PortfolioMerger.stitchByCompositeKey(rawPortfolios);

        // PHASE 2: SUMMATION - Aggregate all unique accounts
        return await PortfolioMerger.sumPortfolios(stitchedPortfolios, targetCurrency);
    }

    /**
     * Phase 1: Stitch portfolios that represent the same account at different times.
     * Groups by composite key (provider::accountId) and uses "Latest Wins" for overlapping dates.
     */
    private static async stitchByCompositeKey(rawPortfolios: UnifiedPortfolio[]): Promise<UnifiedPortfolio[]> {
        const accountGroups = new Map<string, UnifiedPortfolio[]>();

        rawPortfolios.forEach(p => {
            const compositeKey = PortfolioMerger.getCompositeKey(p);
            if (!accountGroups.has(compositeKey)) accountGroups.set(compositeKey, []);
            accountGroups.get(compositeKey)!.push(p);
        });

        const stitchedPortfolios: UnifiedPortfolio[] = [];

        // Process each unique account (provider::accountId combination)
        for (const [compositeKey, group] of accountGroups) {
            if (group.length === 1) {
                // Single file for this account - add sources metadata
                const single = group[0];
                stitchedPortfolios.push({
                    ...single,
                    metadata: {
                        ...single.metadata,
                        sources: [{
                            provider: single.metadata.provider,
                            accountId: single.metadata.accountId || 'UNKNOWN',
                            asOfDate: single.metadata.asOfDate
                        }]
                    }
                });
                continue;
            }

            // Multiple files for same account -> STITCH (time-series extension)
            // This handles: Historical + Recent uploads, Duplicates, Updates


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

            // Create the stitched portfolio for this account with sources traceability
            stitchedPortfolios.push({
                assets: consolidatedAssets,
                cashBalance: latestFile.cashBalance,
                baseCurrency: latestFile.baseCurrency,
                transactions: allTransactions,
                equityHistory: consolidatedHistory,
                cashFlows: consolidatedCashFlows,
                metadata: {
                    provider: latestFile.metadata.provider, // Keep original provider
                    asOfDate: latestFile.metadata.asOfDate,
                    accountId: latestFile.metadata.accountId || 'UNKNOWN',
                    sources: group.map(p => ({
                        provider: p.metadata.provider,
                        accountId: p.metadata.accountId || 'UNKNOWN',
                        asOfDate: p.metadata.asOfDate
                    }))
                }
            });

        }

        return stitchedPortfolios;
    }

    /**
     * Phase 2: Sum multiple stitched accounts into one master portfolio.
     * This aggregates different accounts (e.g., Main + Options, IBKR + Schwab).
     */
    private static async sumPortfolios(stitchedPortfolios: UnifiedPortfolio[], targetCurrency: string): Promise<MergeResult> {
        if (stitchedPortfolios.length === 0) {
            return {
                portfolio: PortfolioMerger.createEmpty(targetCurrency),
                warnings: []
            };
        }

        // Note: Even for single portfolios, we must process through the full conversion logic
        // because the portfolio's baseCurrency might match targetCurrency, but individual
        // cash flows within it might still be in different currencies (e.g., portfolio base=USD
        // but some cash flows are SGD). The early-exit would skip conversion and cause bugs.

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

        // Rate maps for FX conversion
        const portfolioBaseRateMaps = new Map<number, Map<string, number>>(); // Index -> RateMap
        const portfolioLatestRates = new Map<number, number>(); // Index -> Rate

        // 2. Determine Date Range for Bulk FX Fetching
        // We need rates for: Equity History (Daily), Cash Flows (Specific Dates).
        // Assets usually use "Latest" rate (Spot).

        let minDate = new Date(); // Start with "Now" and go back
        let maxDate = new Date(0); // Start with "Epoch" and go forward

        stitchedPortfolios.forEach(p => {
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
        let pIndex = 0;
        for (const p of stitchedPortfolios) {
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
        stitchedPortfolios.forEach(p => {
            if (p.equityHistory) {
                p.equityHistory.forEach(pt => allEquityDates.add(pt.date));
            }
        });
        const sortedDates = Array.from(allEquityDates).sort();

        // Step 2: Iterate valid dates and sum NAVs (Filling Forward missing values)
        const lastKnownNavs = new Map<number, number>(); // PortfolioIndex -> LastNAV in Target Ccy
        // Initialize with zero
        for (let i = 0; i < stitchedPortfolios.length; i++) lastKnownNavs.set(i, 0);

        sortedDates.forEach(date => {
            let dailyTotal = 0;

            // For this date, update lastKnownNavs for any portfolio that has a datapoint
            // Then sum all lastKnownNavs
            stitchedPortfolios.forEach((p, idx) => {
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
        // Wait, the previous tool call showed I am inside `for (const p of portfolios)`.
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
        stitchedPortfolios.forEach(p => {
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
        for (const p of stitchedPortfolios) {
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
                                console.warn(`[PortfolioMerger] No FX rate found for ${cf.currency} → ${targetCurrency}. Using 1.`);
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

        // Collect all sources from stitched portfolios for traceability
        // Each stitched portfolio represents ONE unique account, so we show it once
        const allSources: Array<{ provider: string; accountId: string; asOfDate: string }> = [];
        const accountKeys = new Set<string>();

        stitchedPortfolios.forEach(p => {
            const key = `${p.metadata.provider}::${p.metadata.accountId}`;
            if (!accountKeys.has(key)) {
                accountKeys.add(key);
                allSources.push({
                    provider: p.metadata.provider,
                    accountId: p.metadata.accountId || 'UNKNOWN',
                    asOfDate: p.metadata.asOfDate
                });
            }
        });

        return {
            portfolio: {
                assets: mergedAssets,
                cashBalance: totalCashBalance,
                baseCurrency: targetCurrency,
                transactions: mergedTransactions,
                equityHistory: sortedHistory,
                cashFlows: mergedCashFlows,
                metadata: {
                    provider: stitchedPortfolios.length === 1 ? stitchedPortfolios[0].metadata.provider : 'AGGREGATED',
                    asOfDate: new Date().toISOString().split('T')[0],
                    accountId: stitchedPortfolios.length === 1 ? stitchedPortfolios[0].metadata.accountId : 'MULTI_ACCOUNT',
                    sources: allSources
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
