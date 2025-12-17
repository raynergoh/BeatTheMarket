
import { Asset, OpenPosition } from '../types';
import { ASSET_CATEGORIES } from '../constants';

/**
 * Asset Factory
 * Normalizes raw positions into standardized Asset objects with behavioral methods.
 */
export class AssetFactory {
    static createFromIbkr(position: OpenPosition): Asset {
        const category = AssetFactory.normalizeCategory(position.assetCategory || 'STK');

        return {
            symbol: position.symbol,
            description: position.symbol, // Fallback
            assetClass: category,
            quantity: position.quantity,
            marketValue: position.value,
            currency: position.currency,
            originalCurrency: position.currency, // Preserve original currency
            costBasis: position.costBasisMoney,
            // Preserve original per-share prices (before any FX conversion)
            originalMarkPrice: position.markPrice,
            originalCostBasisPrice: position.costBasisPrice,

            // Behavioral Method Implementation
            getCollateralValue: (baseCurrency: string, fxRates: Map<string, number>) => {
                return AssetFactory.calculateCollateral(position, category, baseCurrency, fxRates);
            }
        };
    }

    private static normalizeCategory(rawCat: string): string {
        if (rawCat === ASSET_CATEGORIES.OPTION || rawCat === 'OPT' || rawCat === 'IOPT') return 'OPTION';
        if (rawCat === ASSET_CATEGORIES.CASH || rawCat === 'CASH') return 'CASH';
        return 'STOCK';
    }

    private static calculateCollateral(
        p: OpenPosition,
        category: string,
        baseCurrency: string,
        fxRates: Map<string, number>
    ): number {
        // Only Short Puts typically require significant collateral in this simplified model
        if (category === 'OPTION' && p.quantity < 0) { // Short
            // Checking for Put (if available) or assuming worst case? 
            // The raw position has putCall info.
            if (p.putCall === 'P') {
                const strike = p.strike || 0;
                const multiplier = p.multiplier || 100;
                const qty = Math.abs(p.quantity);
                const collateralRaw = strike * multiplier * qty;

                // FX Conversion
                const rate = p.currency === baseCurrency ? 1 : (fxRates.get(p.currency) || 1);
                return collateralRaw * rate;
            }
        }
        return 0; // Long options or Stocks usually don't increase collateral requirement (simplification)
    }
}
