import yahooFinanceDefault from 'yahoo-finance2';

// The library version 3.x+ requires instantiation of the default export in some environments
// or suggests it via error message "Call ... new YahooFinance()".
// Since named export 'YahooFinance' does not exist in the build, the default export IS likely the class.
const yahooFinance = new (yahooFinanceDefault as any)();

export interface HistoricalPrice {
    date: string; // YYYY-MM-DD
    close: number;
}

export async function getHistoricalPrices(
    ticker: string,
    startDate: Date,
    endDate: Date
): Promise<HistoricalPrice[]> {
    try {
        // period1 and period2 accept dates or strings
        const queryOptions = {
            period1: startDate,
            period2: endDate,
            interval: '1d' as const, // strictly typed in newer versions
        };

        const result = await yahooFinance.historical(ticker, queryOptions) as any[];

        return result.map((quote: any) => ({
            date: quote.date.toISOString().split('T')[0],
            close: quote.close,
        }));
    } catch (error) {
        console.error(`Failed to fetch historical data for ${ticker}:`, error);
        throw error;
    }
}

export interface AssetProfile {
    sector?: string;
    industry?: string;
    website?: string;
    longBusinessSummary?: string;
    country?: string;
}

export interface EtfHolding {
    symbol: string;
    holdingName: string;
    holdingPercent: number;
}

export interface SectorWeighting {
    [sector: string]: number;
}

export interface EnhancedSymbolData {
    symbol: string;
    assetProfile?: AssetProfile;
    topHoldings?: EtfHolding[];
    sectorWeightings?: SectorWeighting[];
    fundProfile?: {
        categoryName?: string;
    };
}

export async function getEnhancedStockData(tickers: string[]): Promise<Record<string, EnhancedSymbolData>> {
    if (tickers.length === 0) return {};

    const results: Record<string, EnhancedSymbolData> = {};

    // Process in chunks to avoid overwhelming the API
    const chunkStats = (arr: string[], size: number) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
            arr.slice(i * size, i * size + size)
        );
    };

    const chunks = chunkStats(tickers, 5); // Small chunks for quoteSummary

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (ticker) => {
            // Smart Resolution Logic
            let validTicker = ticker;
            const modules = ['assetProfile', 'topHoldings', 'fundProfile'];
            let summary;

            try {
                summary = await yahooFinance.quoteSummary(ticker, { modules });
            } catch (originalError) {
                console.warn(`[YF] Initial fetch failed for ${ticker}. Attempting smart resolution...`);

                try {
                    // Strategy 1: Common Format Fixes (BRK.B -> BRK-B)
                    if (ticker.includes('.')) {
                        const altParams = ticker.replace(/\./g, '-');
                        console.log(`[YF] Trying format fix: ${altParams}`);
                        summary = await yahooFinance.quoteSummary(altParams, { modules });
                        validTicker = altParams;
                    }
                } catch (e) { /* Continue to next strategy */ }

                if (!summary) {
                    try {
                        // Strategy 2: Search API Fallback
                        console.log(`[YF] Searching for ${ticker}...`);
                        const searchResult = await yahooFinance.search(ticker);
                        const bestMatch = searchResult.quotes.find((q: any) =>
                            (q.quoteType === 'ETF' || q.quoteType === 'EQUITY' || q.quoteType === 'MUTUALFUND') && q.isYahooFinance
                        );

                        if (bestMatch) {
                            console.log(`[YF] Search found: ${bestMatch.symbol} (Score: ${bestMatch.score})`);
                            summary = await yahooFinance.quoteSummary(bestMatch.symbol, { modules });
                            validTicker = bestMatch.symbol;
                        }
                    } catch (e) { /* Exhausted options */ }
                }
            }

            if (!summary) {
                // Final Failure
                // console.warn(`Failed to fetch enhanced data for ${ticker}`);
                results[ticker] = { symbol: ticker };
                return;
            }

            const d: EnhancedSymbolData = {
                symbol: ticker, // Keep original symbol as key
                assetProfile: summary.assetProfile,
                topHoldings: summary.topHoldings?.holdings,
                sectorWeightings: summary.fundProfile?.sectorWeightings || summary.topHoldings?.sectorWeightings || [],
                fundProfile: {
                    categoryName: summary.fundProfile?.categoryName
                }
            };
            results[ticker] = d;
        }));
    }

    return results;
}
