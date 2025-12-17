
/**
 * Returns Engine
 * Logic for MWRR / TWR / Annualised Returns.
 */

import { ComparisonPoint } from '../types';

export interface PerformanceMetrics {
    mwr: number;
    annualizedMwr: number;
    benchmarkMwr: number;
    annualizedBenchmarkMwr: number;
}

export function calculatePerformanceMetrics(comparisonData: ComparisonPoint[]): PerformanceMetrics {
    if (comparisonData.length < 2) {
        return { mwr: 0, annualizedMwr: 0, benchmarkMwr: 0, annualizedBenchmarkMwr: 0 };
    }

    const start = comparisonData[0];
    const end = comparisonData[comparisonData.length - 1];

    const startValue = start.portfolioValue || 0;
    const endValue = end.portfolioValue || 0;

    // Benchmark Values
    const startBenchmark = start.benchmarkValue || 0;
    const endBenchmark = end.benchmarkValue || 0;

    const startInvested = start.totalInvested || 0;
    const endInvested = end.totalInvested || 0;
    const netFlow = endInvested - startInvested;

    // Modified Dietz
    // Denominator is the weighted capital. Since flows are identical for both to start with (conceptually), 
    // we use the same sizing logic, though simulation path differs. 
    // Wait, the simulation assumes we buy benchmark with the flows. So timing is same.

    // For Portfolio:
    // Denominator approximation: StartValue + 0.5 * NetFlow (Simple Dietz)
    const denominator = startValue + (0.5 * netFlow);
    const mwrVal = denominator > 0 ? ((endValue - startValue - netFlow) / denominator) : 0;

    // For Benchmark:
    const denominatorBenchmark = startBenchmark + (0.5 * netFlow);
    const benchmarkMwrVal = denominatorBenchmark > 0 ? ((endBenchmark - startBenchmark - netFlow) / denominatorBenchmark) : 0;

    // Annualised
    const startDate = new Date(start.date);
    const endDate = new Date(end.date);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let ann = 0;
    let annBenchmark = 0;
    if (diffDays > 30) {
        const years = diffDays / 365.25;
        // Avoid complex number errors if mwrVal is -1 or less etc
        if (mwrVal > -1) {
            ann = (Math.pow(1 + mwrVal, 1 / years) - 1);
        }
        if (benchmarkMwrVal > -1) {
            annBenchmark = (Math.pow(1 + benchmarkMwrVal, 1 / years) - 1);
        }
    }

    return {
        mwr: mwrVal * 100,
        annualizedMwr: ann * 100,
        benchmarkMwr: benchmarkMwrVal * 100,
        annualizedBenchmarkMwr: annBenchmark * 100
    };
}
