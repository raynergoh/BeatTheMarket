import { NextResponse } from 'next/server';
import { fetchFlexReport } from '@/lib/ibkr/api';
import { parseIBKRXml, CashTransaction, OpenPosition, EquitySummary } from '@/lib/ibkr-parser';
import { getHistoricalPrices, getEnhancedStockData, EnhancedSymbolData } from '@/lib/yahoo-finance';
import { calculateComparison } from '@/lib/calculation-engine';
import { processTransactions } from '@/lib/portfolio/transaction-processor';
import { calculateAllocations } from '@/lib/portfolio/allocator';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, queryId, manualHistory } = body;

        let allCashTransactions: CashTransaction[] = [];
        let allEquitySummary: EquitySummary[] = [];
        let latestOpenPositions: OpenPosition[] = [];

        // 1. Process Manual History first (if any)
        if (Array.isArray(manualHistory)) {
            manualHistory.forEach((fileData: any) => {
                if (fileData.cashTransactions) {
                    allCashTransactions = [...allCashTransactions, ...fileData.cashTransactions];
                }
                if (fileData.equitySummary) {
                    allEquitySummary = [...allEquitySummary, ...fileData.equitySummary];
                }
                // Use positions from the last file in the list as "latest" candidate (unless live data overwrites)
                if (fileData.openPositions && fileData.openPositions.length > 0) {
                    latestOpenPositions = fileData.openPositions;
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

                } catch (err) {
                    console.error(`Error fetching/parsing query ${qId}:`, err);
                    // If manual history exists, allow partial failure
                    if (allCashTransactions.length === 0 && allEquitySummary.length === 0) throw err;
                }
            }
        }

        // If no data was provided at all (neither manual nor live), then return an error.
        if (allCashTransactions.length === 0 && allEquitySummary.length === 0 && latestOpenPositions.length === 0) {
            return NextResponse.json({ error: 'No data provided from manual history or live reports.' }, { status: 400 });
        }

        // 3. Process Transactions (Deduplicate, Gap Detection, Deposits, Lag)
        const { effectiveDeposits, uniqueEquityMap, warnings } = processTransactions(allCashTransactions, allEquitySummary);


        // 6. Calculate Comparison (Benchmark) with adjusted dates
        let comparisonBase: { date: string, benchmarkValue: number, totalInvested: number }[] = [];

        if (effectiveDeposits.length > 0) {
            // Sort by date ascending
            const firstDateStr = effectiveDeposits[0].date;
            const startDate = new Date(firstDateStr);
            const endDate = new Date();

            if (isNaN(startDate.getTime())) {
                console.error('Invalid start date:', firstDateStr);
            } else {
                try {
                    const spyData = await getHistoricalPrices('SPY', startDate, endDate);
                    const benchmarkPrices = spyData.map(d => ({ date: d.date, close: d.close }));
                    comparisonBase = calculateComparison(effectiveDeposits, benchmarkPrices);
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

        return NextResponse.json({
            comparison,
            summary: {
                netWorth: latestOpenPositions.reduce((sum, p) => sum + p.value, 0) || ([...uniqueEquityMap.values()].pop() || 0), // Fallback to last equity summary value if no positions
                // Alternatively, use the last Equity Summary value which is more accurate for NAV
                // netWorth: uniqueEquityMap.get([...uniqueEquityMap.keys()].sort().pop() || '') || ...,
                totalDeposited: effectiveDeposits.reduce((sum, d) => sum + d.amount, 0),
                benchmarkValue: comparison.length > 0 ? comparison[comparison.length - 1].benchmarkValue : 0
            },
            holdings: latestOpenPositions.map(p => ({
                ...p,
                symbol: p.symbol === 'CSSPXz' ? 'CSPX.L' : p.symbol
            })),
            categories,
            debugDeposits: effectiveDeposits,
            warnings
        });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
