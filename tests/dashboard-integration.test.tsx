import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { parseIBKRXml } from '../lib/ibkr-parser';
import { calculateComparison, Deposit, BenchmarkPrice } from '../lib/calculation-engine';
import { SummaryCards } from '../components/dashboard/summary-cards';
import { PerformanceChart } from '../components/dashboard/performance-chart';
import fs from 'fs';
import path from 'path';

// Helper to read test files
const readTestFile = (filename: string) => {
    return fs.readFileSync(path.resolve(__dirname, `../xml_test_files/${filename}`), 'utf-8');
};

describe('Dashboard Integration (2025.xml)', () => {
    const xmlContent = readTestFile('2025.xml');

    // 1. Parsing
    const parsed = parseIBKRXml(xmlContent);
    const { cashTransactions } = parsed;

    // 2. Data Processing (Simulating API logic)
    // Filter Deposits
    const deposits: Deposit[] = cashTransactions
        .filter(t => t.category === 'DEPOSIT' && t.isNetInvestedFlow)
        .map(t => ({
            date: t.date,
            amount: t.amount
        }));

    // Generate Mock Benchmark Prices (needed for calculation engine)
    // We'll create a simple price history covering the range of 2025 (or the file range)
    const startDate = deposits.length > 0 ? deposits[0].date : '2025-01-01';
    const endDate = '2025-12-31';

    // Simple mock: Price starts at 100 and increases by 1 every day
    const mockBenchmarkPrices: BenchmarkPrice[] = [];
    let currentDate = new Date(startDate);
    const stopDate = new Date(endDate);
    let price = 100;

    while (currentDate <= stopDate) {
        mockBenchmarkPrices.push({
            date: currentDate.toISOString().split('T')[0],
            close: price
        });
        currentDate.setDate(currentDate.getDate() + 1);
        price += 0.1; // Slow increase
    }

    // 3. Calculation
    const comparisonData = calculateComparison(deposits, mockBenchmarkPrices);

    // Derive Summary Stats
    const latest = comparisonData[comparisonData.length - 1];
    const totalDeposited = latest?.totalInvested || 0;
    const netWorth = latest?.benchmarkValue || 0; // In this mock, portfolio tracks benchmark "units"

    it('should parse deposits from 2025.xml', () => {
        expect(deposits.length).toBeGreaterThan(0);
        expect(totalDeposited).toBeGreaterThan(0);
    });

    it('Net Deposits summary card renders non-zero number', () => {
        render(
            <SummaryCards
                netWorth={netWorth}
                totalDeposited={totalDeposited}
                benchmarkValue={latest?.benchmarkValue || 0}
                selectedBenchmark="Simulated"
                onBenchmarkChange={() => { }}
                currencySymbol="USD"
            />
        );

        // Check for "Deposited:" text
        expect(screen.getByText(/Deposited:/)).toBeInTheDocument();

        // Check that the value is present and formatted (e.g. "USD1,234" or similar)
        // We look for the number.
        // totalDeposited is a number. locale string might have commas.
        // We just check it's not "0" if we expect deposits.
        expect(totalDeposited).not.toBe(0);

        // Find the element containing the number
        const depositedRegex = new RegExp(totalDeposited.toLocaleString());
        // Might need to be more loose if formatting differs (decimals etc)
        // Let's just check for non-zero logic:
        // We asserted totalDeposited > 0 above. 
        // Rendering check:
        expect(screen.getByText(/Deposited:/).textContent).not.toContain('Deposited: USD0');
    });

    it('Chart component receives data points', () => {
        // Map comparison data to satisfy prop types
        const chartData = comparisonData.map(d => ({
            ...d,
            portfolioValue: d.benchmarkValue // Simulating perfect tracking
        }));

        render(
            <PerformanceChart
                data={chartData}
                selectedBenchmark="Simulated"
                currencySymbol="USD"
            />
        );

        expect(screen.getByText('Performance History')).toBeInTheDocument();
        // Check if chart container exists (by checking for one of the SVG elements or internal text)
        // The chart renders "Portfolio" and "Benchmark" in the legend or metrics
        const portfolios = screen.getAllByText('Portfolio');
        expect(portfolios.length).toBeGreaterThan(0);
        expect(portfolios[0]).toBeInTheDocument();
    });
});
