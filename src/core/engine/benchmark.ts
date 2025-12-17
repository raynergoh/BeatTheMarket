
import { Asset, Deposit, ComparisonPoint, BenchmarkPrice } from '../types';
import { ASSET_CATEGORIES } from '../constants';

/**
 * Benchmark Engine
 * Logic for "What-If" Analysis and Collateral Simulation.
 */

export function calculateShortPutCollateral(assets: Asset[], fxRates: Map<string, number>, baseCurrency: string): number {
    return assets.reduce((total, asset) => {
        return total + asset.getCollateralValue(baseCurrency, fxRates);
    }, 0);
}

export function synthesizeCollateralDeposit(
    effectiveDeposits: Deposit[],
    requiredCollateral: number,
    baseCurrency: string
): Deposit[] {
    const currentNetDeposits = effectiveDeposits.reduce((sum, d) => sum + d.amount, 0);

    if (requiredCollateral > currentNetDeposits) {
        const shortfall = requiredCollateral - currentNetDeposits;

        // Create synthetic deposit
        const firstDate = effectiveDeposits.length > 0 ? effectiveDeposits[0].date : new Date().toISOString().split('T')[0];

        const synthetic: Deposit = {
            date: firstDate,
            amount: shortfall,
            originalAmount: shortfall,
            currency: baseCurrency,
            description: 'Synthetic Collateral Adjustment',
            type: 'Adjustment',
            transactionId: 'SYNTHETIC_COLLATERAL'
        };

        // Prepend to deposits
        return [synthetic, ...effectiveDeposits]; // New array
    }

    return effectiveDeposits;
}

export function calculateComparison(
    deposits: Deposit[],
    benchmarkPrices: BenchmarkPrice[]
): ComparisonPoint[] {
    // 1. Sort inputs to be safe
    const sortedDeposits = [...deposits].sort((a, b) => a.date.localeCompare(b.date));
    const sortedPrices = [...benchmarkPrices].sort((a, b) => a.date.localeCompare(b.date));

    let currentUnits = 0;
    let totalInvested = 0;
    let depositIdx = 0;
    const result: ComparisonPoint[] = [];

    for (const pricePoint of sortedPrices) {
        const priceDate = pricePoint.date;
        const priceClose = pricePoint.close;

        // 2. Check for any deposits that happened on or before this price date
        //    and haven't been processed yet.
        while (
            depositIdx < sortedDeposits.length &&
            sortedDeposits[depositIdx].date <= priceDate
        ) {
            const deposit = sortedDeposits[depositIdx];
            const unitsBought = deposit.amount / priceClose;
            currentUnits += unitsBought;
            totalInvested += deposit.amount;
            depositIdx++;
        }

        // 3. Calculate value for this day
        const currentValue = currentUnits * priceClose;

        result.push({
            date: priceDate,
            benchmarkValue: Number(currentValue.toFixed(2)),
            totalInvested: Number(totalInvested.toFixed(2)),
        });
    }

    return result;
}
