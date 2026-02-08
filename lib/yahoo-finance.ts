import YahooFinance from 'yahoo-finance2';
import pLimit from 'p-limit';

// v3.13.0 includes built-in user-agent and fixes for 429 errors (issue #977)
// No need to set custom headers - library handles this automatically
const yahooFinance = new YahooFinance();

// ===========================
// CONCURRENCY CONTROL
// ===========================

/**
 * Concurrency limiter using p-limit
 * Allows 10 parallel requests to Yahoo Finance for fast portfolio loading
 * Prevents overwhelming the API while maintaining performance
 */
const limit = pLimit(10);

/**
 * Fast exponential backoff retry wrapper
 * Retries failed requests up to maxRetries times with exponential delay
 * Optimized for production: 500ms, 1s, 2s (vs old 1s, 2s, 4s with 10s for 429)
 */
async function fetchWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 500
): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const isLastAttempt = attempt === maxRetries - 1;

            if (isLastAttempt) {
                throw error;
            }

            // Fast exponential backoff: 500ms, 1s, 2s
            const delayMs = baseDelayMs * Math.pow(2, attempt);

            console.warn(
                `[YF Retry] Attempt ${attempt + 1}/${maxRetries} failed. ` +
                `Waiting ${delayMs}ms before retry. Error: ${error?.message || error}`
            );

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    throw new Error('fetchWithRetry: Should not reach here');
}

/**
 * Request deduplication cache
 * Prevents multiple concurrent identical requests
 */
const inflightRequests = new Map<string, Promise<any>>();

function dedupedRequest<T>(
    cacheKey: string,
    fn: () => Promise<T>
): Promise<T> {
    // Check if request is already in flight
    if (inflightRequests.has(cacheKey)) {
        console.log(`[YF Dedup] Cache hit for ${cacheKey}`);
        return inflightRequests.get(cacheKey)!;
    }

    // Execute request and cache the promise
    const promise = fn()
        .finally(() => {
            // Clean up after request completes
            inflightRequests.delete(cacheKey);
        });

    inflightRequests.set(cacheKey, promise);
    return promise;
}

// ===========================
// PUBLIC API FUNCTIONS
// ===========================

export interface HistoricalPrice {
    date: string; // YYYY-MM-DD
    close: number;
}

export async function getHistoricalPrices(
    ticker: string,
    startDate: Date,
    endDate: Date
): Promise<HistoricalPrice[]> {
    const cacheKey = `historical-${ticker}-${startDate.toISOString()}-${endDate.toISOString()}`;

    return dedupedRequest(cacheKey, () =>
        limit(() =>
            fetchWithRetry(async () => {
                try {
                    console.log(`[YF] Fetching historical prices for ${ticker}`);

                    const queryOptions = {
                        period1: startDate,
                        period2: endDate,
                        interval: '1d' as const,
                    };

                    const result = await yahooFinance.historical(ticker, queryOptions) as any[];

                    return result.map((quote: any) => ({
                        date: quote.date.toISOString().split('T')[0],
                        close: quote.close,
                    }));
                } catch (error) {
                    console.error(`[YF] Failed to fetch historical data for ${ticker}:`, error);
                    throw error;
                }
            })
        )
    );
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

    // Process sequentially through rate limiter (no longer using chunks/parallel processing)
    // This ensures we don't overwhelm the API with concurrent requests
    for (const ticker of tickers) {
        const cacheKey = `enhanced-${ticker}`;

        try {
            const symbolData = await dedupedRequest(cacheKey, () =>
                limit(() =>
                    fetchWithRetry(async () => {
                        // Smart Resolution Logic
                        let validTicker: string = ticker;
                        const modules: ('assetProfile' | 'topHoldings' | 'fundProfile')[] = ['assetProfile', 'topHoldings', 'fundProfile'];
                        let summary;

                        try {
                            console.log(`[YF] Fetching enhanced data for ${ticker}`);
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

                                    if (bestMatch && bestMatch.symbol) {
                                        const symbolStr = bestMatch.symbol as string;
                                        console.log(`[YF] Search found: ${symbolStr}`);
                                        summary = await yahooFinance.quoteSummary(symbolStr, { modules });
                                        validTicker = symbolStr;
                                    }
                                } catch (e) { /* Exhausted options */ }
                            }
                        }

                        if (!summary) {
                            // Return minimal data for failed fetch
                            return { symbol: ticker };
                        }

                        const d: EnhancedSymbolData = {
                            symbol: ticker, // Keep original symbol as key
                            assetProfile: summary.assetProfile,
                            topHoldings: summary.topHoldings?.holdings,
                            sectorWeightings: (summary.fundProfile?.sectorWeightings || summary.topHoldings?.sectorWeightings || []) as SectorWeighting[],
                            fundProfile: {
                                categoryName: summary.fundProfile?.categoryName || undefined
                            }
                        };
                        return d;
                    })
                )
            );

            results[ticker] = symbolData;
        } catch (error) {
            console.error(`[YF] Failed to fetch enhanced data for ${ticker} after retries:`, error);
            results[ticker] = { symbol: ticker };
        }
    }

    return results;
}
