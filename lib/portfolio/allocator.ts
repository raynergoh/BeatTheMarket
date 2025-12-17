import { Asset } from "@/src/core/types";
import { EnhancedSymbolData } from "@/lib/yahoo-finance";
import { ETF_GEO_MAP, ETF_ASSET_MAP } from "@/lib/etf-geo-map";

export interface AllocationCategories {
    asset: { name: string; value: number }[];
    sector: { name: string; value: number }[];
    industry: { name: string; value: number }[];
    geo: { name: string; value: number }[];
    ticker: { name: string; value: number }[];
}

export function calculateAllocations(
    positions: Asset[],
    allEnhancedData: Record<string, EnhancedSymbolData>
): AllocationCategories {
    const allocationMaps = {
        asset: new Map<string, number>(),
        sector: new Map<string, number>(),
        industry: new Map<string, number>(),
        geo: new Map<string, number>(),
        ticker: new Map<string, number>(),
    };

    positions.forEach(pos => {
        const value = pos.marketValue;
        if (value === 0) return;

        // 1. Asset Allocation
        let assetType = 'EQUITIES'; // Default

        // Explicit Map Override (Highest Priority)
        if (ETF_ASSET_MAP[pos.symbol]) {
            assetType = ETF_ASSET_MAP[pos.symbol];
        }
        // Trust IBKR Data for Cash
        else if (pos.assetClass === 'CASH' || ['USD', 'SGD', 'EUR', 'GBP', 'AUD', 'JPY', 'CAD', 'HKD', 'CNH'].includes(pos.symbol)) {
            assetType = 'CASH';
        }
        else {
            // Smart Asset Classification via Yahoo Category
            const data = allEnhancedData[pos.symbol];
            const cat = data?.fundProfile?.categoryName || '';

            if (cat.includes('Bond') || cat.includes('Government') || cat.includes('Treasury') || cat.includes('Fixed Income')) {
                assetType = 'FIXED INCOME';
            } else if (cat.includes('Commodity') || cat.includes('Gold') || cat.includes('Silver') || cat.includes('Precious Metals')) {
                assetType = 'COMMODITIES';
            }
        }

        allocationMaps.asset.set(assetType, (allocationMaps.asset.get(assetType) || 0) + value);

        if (assetType === 'CASH' || ['USD', 'SGD', 'EUR', 'AUD', 'GBP', 'CAD', 'HKD', 'JPY'].includes(pos.symbol)) return;

        const data = allEnhancedData[pos.symbol];

        // PRIORITY: Check Static Map first (handles special cases like TLT, GLD)
        const staticGeo = ETF_GEO_MAP[pos.symbol];
        if (staticGeo) {
            // Use static map for geo
            for (const [country, weight] of Object.entries(staticGeo)) {
                const val = value * weight;
                allocationMaps.geo.set(country, (allocationMaps.geo.get(country) || 0) + val);
            }

            // For sector/industry, try to use data if available, otherwise use fallback
            if (data?.sectorWeightings && data.sectorWeightings.length > 0) {
                data.sectorWeightings.forEach(w => {
                    for (const [sectorName, weight] of Object.entries(w)) {
                        const sectorValue = value * weight;
                        const formattedSector = sectorName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        allocationMaps.sector.set(formattedSector, (allocationMaps.sector.get(formattedSector) || 0) + sectorValue);
                    }
                });
            } else {
                allocationMaps.sector.set('Others', (allocationMaps.sector.get('Others') || 0) + value);
            }

            allocationMaps.industry.set('Others', (allocationMaps.industry.get('Others') || 0) + value);

            // Ticker Breakdown (Even for Static Geo items, try to get holdings)
            const TICKER_ALIASES: Record<string, string> = {
                'FB': 'META',
                'BRK.B': 'BRK-B'
            };
            let capturedTickerWeight = 0;
            if (data?.topHoldings && data.topHoldings.length > 0) {
                data.topHoldings.forEach(h => {
                    let sym = h.symbol;
                    if (TICKER_ALIASES[sym]) sym = TICKER_ALIASES[sym];

                    const hVal = value * h.holdingPercent;
                    allocationMaps.ticker.set(sym, (allocationMaps.ticker.get(sym) || 0) + hVal);
                    capturedTickerWeight += h.holdingPercent;
                });
            }

            if (capturedTickerWeight < 1) {
                const remainder = value * (1 - capturedTickerWeight);
                // If we captured NOTHING (0%), it means no holdings data (e.g. TLT/GLD). 
                // Show the ETF ticker itself instead of 'Others'.
                const fallbackTicker = capturedTickerWeight === 0 ? pos.symbol : 'Others';
                allocationMaps.ticker.set(fallbackTicker, (allocationMaps.ticker.get(fallbackTicker) || 0) + remainder);
            }

            return; // Skip the rest of the logic
        }

        // Check if it's an ETF (has holdings) or a Stock
        const isEtf = data?.topHoldings && data.topHoldings.length > 0;
        const isStock = !isEtf && data?.assetProfile?.sector;

        if (isStock) {
            // --- STOCK LOGIC ---
            let sec = data?.assetProfile?.sector || 'Others';
            let ind = data?.assetProfile?.industry || 'Others';
            if (sec === 'Other' || sec === 'Unknown') sec = 'Others';
            if (ind === 'Other' || ind === 'Unknown') ind = 'Others';
            const country = data?.assetProfile?.country || 'Others';

            allocationMaps.sector.set(sec, (allocationMaps.sector.get(sec) || 0) + value);
            allocationMaps.industry.set(ind, (allocationMaps.industry.get(ind) || 0) + value);
            allocationMaps.geo.set(country, (allocationMaps.geo.get(country) || 0) + value);
            allocationMaps.ticker.set(pos.symbol, (allocationMaps.ticker.get(pos.symbol) || 0) + value);

        } else if (isEtf) {
            // --- ETF LOGIC ---

            // A. SECTOR
            if (data?.sectorWeightings && data.sectorWeightings.length > 0) {
                // Use explicit sector weights (preferred)
                data.sectorWeightings.forEach(w => {
                    for (const [sectorName, weight] of Object.entries(w)) {
                        const sectorValue = value * weight;
                        const formattedSector = sectorName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        allocationMaps.sector.set(formattedSector, (allocationMaps.sector.get(formattedSector) || 0) + sectorValue);
                    }
                });
            } else {
                // Fallback to aggregation
                let capturedWeight = 0;
                data!.topHoldings!.forEach(h => {
                    const hVal = value * h.holdingPercent;
                    const hData = allEnhancedData[h.symbol];
                    let sec = hData?.assetProfile?.sector || 'Others';
                    if (sec === 'Other' || sec === 'Unknown') sec = 'Others';
                    allocationMaps.sector.set(sec, (allocationMaps.sector.get(sec) || 0) + hVal);
                    capturedWeight += h.holdingPercent;
                });
                if (capturedWeight < 1) {
                    const remainder = value * (1 - capturedWeight);
                    allocationMaps.sector.set('Others', (allocationMaps.sector.get('Others') || 0) + remainder);
                }
            }

            // B. INDUSTRY (Extrapolated)
            let capturedIndWeight = 0;
            data!.topHoldings!.forEach(h => capturedIndWeight += h.holdingPercent);

            if (capturedIndWeight > 0.3) {
                const multiplier = 1 / capturedIndWeight;
                data!.topHoldings!.forEach(h => {
                    const hVal = value * h.holdingPercent * multiplier;
                    const hData = allEnhancedData[h.symbol];
                    const ind = hData?.assetProfile?.industry || 'Unknown';
                    allocationMaps.industry.set(ind, (allocationMaps.industry.get(ind) || 0) + hVal);
                });
            } else {
                let usedWeight = 0;
                data!.topHoldings!.forEach(h => {
                    const hVal = value * h.holdingPercent;
                    const hData = allEnhancedData[h.symbol];
                    let ind = hData?.assetProfile?.industry || 'Others';
                    if (ind === 'Other' || ind === 'Unknown') ind = 'Others';
                    allocationMaps.industry.set(ind, (allocationMaps.industry.get(ind) || 0) + hVal);
                    usedWeight += h.holdingPercent;
                });
                if (usedWeight < 1) {
                    const remainder = value * (1 - usedWeight);
                    allocationMaps.industry.set('ETF', (allocationMaps.industry.get('ETF') || 0) + remainder);
                }
            }

            // C. GEO (Static Map -> Extrapolated)
            const staticGeo = ETF_GEO_MAP[pos.symbol];

            // Note: Prior logic already handled staticGeo above with higher priority return.
            // But if we are here, staticGeo was null. So we proceed with category inference.

            // C2. Category-Based Inference (Scalable Solution)
            const categoryName = data?.fundProfile?.categoryName || '';
            const isUSCategory = categoryName.includes('US') || categoryName.includes('United States') || categoryName.includes('Large Blend');

            if (isUSCategory) {
                allocationMaps.geo.set('United States', (allocationMaps.geo.get('United States') || 0) + value);
            } else if (categoryName.includes('Europe')) {
                allocationMaps.geo.set('Europe', (allocationMaps.geo.get('Europe') || 0) + value);
            } else if (categoryName.includes('China')) {
                allocationMaps.geo.set('China', (allocationMaps.geo.get('China') || 0) + value);
            } else {
                // Fallback to Extrapolation
                let capturedGeoWeight = 0;
                if (data?.topHoldings) {
                    data.topHoldings.forEach(h => capturedGeoWeight += h.holdingPercent);
                }

                if (capturedGeoWeight > 0.3) {
                    const multiplier = 1 / capturedGeoWeight;
                    data!.topHoldings!.forEach(h => {
                        const hVal = value * h.holdingPercent * multiplier;
                        const hData = allEnhancedData[h.symbol];
                        let country = hData?.assetProfile?.country || data?.assetProfile?.country || 'Others';
                        if (country === 'Other' || country === 'Unknown') country = 'Others';
                        allocationMaps.geo.set(country, (allocationMaps.geo.get(country) || 0) + hVal);
                    });
                } else {
                    let usedWeight = 0;
                    data!.topHoldings!.forEach(h => {
                        const hVal = value * h.holdingPercent;
                        const hData = allEnhancedData[h.symbol];
                        let country = hData?.assetProfile?.country || data?.assetProfile?.country || 'Others';
                        if (country === 'Other' || country === 'Unknown') country = 'Others';
                        allocationMaps.geo.set(country, (allocationMaps.geo.get(country) || 0) + hVal);
                        usedWeight += h.holdingPercent;
                    });
                    if (usedWeight < 1) {
                        const remainder = value * (1 - usedWeight);
                        let fundCountry = data?.assetProfile?.country || 'Others';
                        if (fundCountry === 'Other' || fundCountry === 'Unknown') fundCountry = 'Others';
                        allocationMaps.geo.set(fundCountry, (allocationMaps.geo.get(fundCountry) || 0) + remainder);
                    }
                }
            }


            // D. TICKER (Breakdown + Global Others)
            let capturedTickerWeight = 0;
            const TICKER_ALIASES: Record<string, string> = {
                'FB': 'META',
                'BRK.B': 'BRK-B'
            };
            if (data?.topHoldings) {
                data.topHoldings.forEach(h => {
                    // if (h.holdingPercent < 0.005) return; // Removed to allow full aggregation
                    let sym = h.symbol;
                    if (TICKER_ALIASES[sym]) sym = TICKER_ALIASES[sym];

                    const hVal = value * h.holdingPercent;
                    allocationMaps.ticker.set(sym, (allocationMaps.ticker.get(sym) || 0) + hVal);
                    capturedTickerWeight += h.holdingPercent;
                });
            }
            // Remainder
            if (capturedTickerWeight < 1) {
                const remainder = value * (1 - capturedTickerWeight);
                // If we captured NOTHING (0%), it means no holdings data. 
                // Show the ETF ticker itself instead of 'Others'.
                const fallbackTicker = capturedTickerWeight === 0 ? pos.symbol : 'Others';
                allocationMaps.ticker.set(fallbackTicker, (allocationMaps.ticker.get(fallbackTicker) || 0) + remainder);
            }

        } else {
            // --- FALLBACK (Unknown/Other) ---
            const fallback = 'Others';
            allocationMaps.sector.set(fallback, (allocationMaps.sector.get(fallback) || 0) + value);
            allocationMaps.industry.set(fallback, (allocationMaps.industry.get(fallback) || 0) + value);
            allocationMaps.geo.set('Others', (allocationMaps.geo.get('Others') || 0) + value);
            allocationMaps.ticker.set('Others', (allocationMaps.ticker.get('Others') || 0) + value); // Group unknown stocks into 'Others' ticker too
        }
    });

    const mapToArray = (map: Map<string, number>) => {
        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    };

    return {
        asset: mapToArray(allocationMaps.asset),
        sector: mapToArray(allocationMaps.sector),
        industry: mapToArray(allocationMaps.industry),
        geo: mapToArray(allocationMaps.geo),
        ticker: mapToArray(allocationMaps.ticker),
    };
}
