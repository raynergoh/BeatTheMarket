export interface Deposit {
    date: string; // YYYY-MM-DD
    amount: number;
}

export interface BenchmarkPrice {
    date: string; // YYYY-MM-DD
    close: number;
}

export interface ComparisonPoint {
    date: string;
    benchmarkValue: number;
    totalInvested: number;
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
        //    This effectively "buys" at the next available market close price 
        //    if the deposit was on a weekend/holiday.
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

    // Handle case where there are remaining deposits after the last price date?
    // Usually this means market data is stale or deposit is in future. 
    // We can ignore or append them. For now, we only calculate up to available price data.

    return result;
}
