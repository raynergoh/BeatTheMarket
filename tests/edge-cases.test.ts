import { describe, it, expect } from 'vitest';
import { parseIBKRXml } from '../lib/ibkr-parser';
import fs from 'fs';
import path from 'path';

// Helper to read test files
const readTestFile = (filename: string) => {
    return fs.readFileSync(path.resolve(__dirname, `../xml_test_files/${filename}`), 'utf-8');
};

describe('Edge Case Fuzzing', () => {
    const validXml = readTestFile('2025.xml');

    it('should degrade gracefully when FinancialInstrumentInformation is missing', () => {
        // Case: Remove <FinancialInstrumentInformation> section
        // This section provides Multipliers. If missing, parser should default to 1.

        // Regex to remove the block. The tag might be named FinancialInstrumentInformation or SecurityInfo.
        // It's nested in FlexStatement.
        const corrupted = validXml.replace(/<FinancialInstrumentInformation>[\s\S]*?<\/FinancialInstrumentInformation>/g, '');
        // Also try SecurityInfo if present
        const corrupted2 = corrupted.replace(/<SecurityInfo>[\s\S]*?<\/SecurityInfo>/g, '');

        const result = parseIBKRXml(corrupted2);

        // Assert it didn't crash
        expect(result).toBeDefined();

        // Assert Multipliers default to 1
        // (Assuming we have some positions)
        if (result.openPositions.length > 0) {
            result.openPositions.forEach(p => {
                // Ignore synthesized CASH positions which have undefined multiplier
                if (p.symbol === 'CASH' || p.assetCategory === 'CASH') return;

                expect(p.multiplier).toBe(1);
            });
        }
    });

    it('should handle invalid Currency codes without crashing', () => {
        // Case: Change a currency to "XYZ"
        const corrupted = validXml.replace(/currency="USD"/g, 'currency="XYZ"');

        const result = parseIBKRXml(corrupted);

        const xyzTrans = result.cashTransactions.find(t => t.currency === 'XYZ');
        expect(xyzTrans).toBeDefined();
    });

    it('should handle malformed dates gracefully', () => {
        // Case: Change date format from YYYYMMDD to "InvalidDateString" (length > 8 to avoid formatting attempt)
        const corrupted = validXml.replace(/dateTime="2025\d{4}/g, 'dateTime="InvalidDateString');

        const result = parseIBKRXml(corrupted);

        const badDateTrans = result.cashTransactions.find(t => t.date.includes('InvalidDateString'));
        expect(badDateTrans).toBeDefined();
    });

    it('should throw error if XML structure is completely broken', () => {
        const corrupted = validXml.substring(0, validXml.length / 2);
        expect(() => parseIBKRXml(corrupted)).toThrow();
    });
});
