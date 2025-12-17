import { describe, it, expect } from 'vitest';
import { parseFlexReport } from '../src/core/parser';
import fs from 'fs';
import path from 'path';

describe('parseFlexReport', () => {
    it('should parse valid IBKR XML correctly', () => {
        const xmlContent = fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/sample-ibkr.xml'), 'utf-8');
        const result = parseFlexReport(xmlContent);

        expect(result).toBeDefined();

        // Check Cash Transactions
        expect(result.cashTransactions).toHaveLength(2);
        expect(result.cashTransactions[0]).toMatchObject({
            amount: 1000.00,
            currency: 'USD',
            description: 'Deposit',
            transactionId: 'TX123-undefined' // accountId was not in test fixture
        });

        // Check Open Positions
        // Should have 3 positions: AAPL, GOOGL, and USD
        expect(result.openPositions).toHaveLength(3);

        const aapl = result.openPositions.find(p => p.symbol === 'AAPL');
        expect(aapl).toBeDefined();
        expect(aapl?.quantity).toBe(10);

        const cash = result.openPositions.find(p => p.symbol === 'USD' || p.symbol === 'CASH');
        expect(cash).toBeDefined();
        // Since we have an explicit CASH position in OpenPositions, it should use that or merge with EquitySummary synthesized one.
        // In our fixture, we have an explicit one with 500.

        // Check Equity Summary
        expect(result.equitySummary).toHaveLength(1);
        expect(result.equitySummary[0].total).toBe(2900.00);
    });

    it('should throw error for non-XML content', () => {
        const invalidContent = "This is not XML";
        expect(() => parseFlexReport(invalidContent)).toThrow('Received data is not XML');
    });

    it('should handle empty or malformed XML gracefully', () => {
        // Valid XML but missing FlexQueryResponse
        const malformedXML = "<Root></Root>";
        expect(() => parseFlexReport(malformedXML)).toThrow('Invalid IBKR XML');
    });

    it('should synthesize cash position from EquitySummary if missing in OpenPositions', () => {
        // Create XML with NO OpenPositions
        const xmlWithoutPositions = `
        <FlexQueryResponse>
            <FlexStatements>
                <FlexStatement>
                    <EquitySummaryInBase>
                         <EquitySummaryByReportDateInBase reportDate="2024-01-31" total="1000.00" cash="200.00" />
                    </EquitySummaryInBase>
                </FlexStatement>
            </FlexStatements>
        </FlexQueryResponse>
        `;

        const result = parseFlexReport(xmlWithoutPositions);
        expect(result.openPositions).toHaveLength(1);
        expect(result.openPositions[0].symbol).toBe('CASH');
        expect(result.openPositions[0].quantity).toBe(200.00);
    });
});
