
import { OpenPosition, AssetCategory } from '../types';
import { ASSET_CATEGORIES, LEVEL_OF_DETAIL, REGEX } from '../constants';
import { toArray } from './xml-utils';

export function parseOpenPositions(statement: any, securitiesMap: Map<string, number>): OpenPosition[] {
    const rawPositions = toArray(statement.OpenPositions?.OpenPosition);
    return filterAndNormalizePositions(rawPositions, securitiesMap);
}

function filterAndNormalizePositions(allRawPositions: any[], securitiesMap: Map<string, number>): OpenPosition[] {
    // Filter Logic:
    // 1. Prefer "SUMMARY" for Stocks/Equities.
    // 2. Ensure we capture "CASH" positions (which might not be labeled SUMMARY).

    const summaryPositions = allRawPositions.filter((p: any) => p.levelOfDetail === LEVEL_OF_DETAIL.SUMMARY);
    const rawCashPositions = allRawPositions.filter(isCashRaw);

    let positionsToUse: any[] = [];

    if (summaryPositions.length > 0) {
        positionsToUse = [...summaryPositions];

        // Check if we missed cash in the summary
        const summaryHasCash = summaryPositions.some(isCashRaw);
        if (!summaryHasCash && rawCashPositions.length > 0) {
            // Add raw cash positions if not present in summary
            positionsToUse = [...positionsToUse, ...rawCashPositions];
        }
    } else {
        // Fallback if no summary lines found at all
        positionsToUse = allRawPositions;
    }

    // Deduplicate by symbol+currency
    const uniquePosMap = new Map();
    positionsToUse.forEach((p: any) => {
        const key = `${p.symbol}-${p.currency}`;
        if (!uniquePosMap.has(key)) {
            uniquePosMap.set(key, p);
        }
    });

    const dedupedCtx = Array.from(uniquePosMap.values());

    return dedupedCtx.map((pos: any) => {
        // Try to look up multiplier
        const multiplier = securitiesMap.get(pos.symbol) || parseFloat(pos.multiplier || '1');

        return {
            symbol: pos.symbol,
            quantity: parseFloat(pos.position),
            costBasisPrice: parseFloat(pos.costBasisPrice),
            costBasisMoney: parseFloat(pos.costBasisMoney),
            markPrice: parseFloat(pos.markPrice),
            value: parseFloat(pos.positionValue),
            currency: pos.currency,
            percentOfNAV: parseFloat(pos.percentOfNAV || '0'),
            levelOfDetail: pos.levelOfDetail,
            assetCategory: pos.assetCategory as AssetCategory,
            putCall: pos.putCall, // 'P' or 'C'
            strike: parseFloat(pos.strike || '0'),
            expiry: pos.expiry,
            multiplier: multiplier
        };
    });
}

export function isCashRaw(p: any): boolean {
    // 1. Explicit asset category
    if (p.assetCategory === ASSET_CATEGORIES.CASH) return true;
    // 2. Symbol is 'CASH'
    if (p.symbol === 'CASH') return true;
    // 3. Symbol looks like a currency code (3 uppercase letters) and no other complexity
    if (p.symbol && REGEX.CURRENCY_CODE.test(p.symbol) && (!p.assetCategory || p.assetCategory === ASSET_CATEGORIES.CASH)) return true;

    return false;
}
