import { describe, it, expect } from 'vitest';
import { getHistoricalFxRates } from './fx-rates';

// Note: These tests might fail if Yahoo Finance API is down or rate limited. 
// Ideally we mock yahoo-finance2, but for "Zero Cost" & speed we test live or just logic?
// The user prompt implies using yahoo-finance2. 
// Let's mock it to test logic (ticker selection, inversion).

import yahooFinance from 'yahoo-finance2';

// Mock yahooFinance
// We need to spy on 'historical'
import { vi } from 'vitest';

vi.mock('yahoo-finance2', () => ({
    default: {
        historical: vi.fn()
    }
}));

describe('getHistoricalFxRates', () => {
    it('returns empty array if source equals target', async () => {
        const rates = await getHistoricalFxRates('USD', 'USD', new Date());
        expect(rates).toEqual([]);
    });

    it('requests correct ticker for USD -> SGD', async () => {
        const mockHistorical = yahooFinance.historical as unknown as ReturnType<typeof vi.fn>;
        mockHistorical.mockResolvedValue([
            { date: new Date('2023-01-01'), close: 1.34 }
        ]);

        const rates = await getHistoricalFxRates('USD', 'SGD', new Date('2023-01-01'), new Date('2023-01-02'));

        expect(mockHistorical).toHaveBeenCalledWith('SGD=X', expect.anything());
        expect(rates[0].rate).toBe(1.34);
    });

    it('requests correct ticker for USD -> EUR (Major Pair Inversion Check)', async () => {
        const mockHistorical = yahooFinance.historical as unknown as ReturnType<typeof vi.fn>;
        // EURUSD=X returns 1.10 (USD per EUR)
        mockHistorical.mockResolvedValue([
            { date: new Date('2023-01-01'), close: 1.10 }
        ]);

        // We want USD -> EUR. 
        // 1 USD = (1/1.10) EUR = 0.909
        const rates = await getHistoricalFxRates('USD', 'EUR', new Date('2023-01-01'), new Date('2023-01-02'));

        expect(mockHistorical).toHaveBeenCalledWith('EURUSD=X', expect.anything());
        expect(rates[0].rate).toBeCloseTo(1 / 1.10, 4);
    });

    it('requests correct ticker for EUR -> USD (Major Pair Direct)', async () => {
        const mockHistorical = yahooFinance.historical as unknown as ReturnType<typeof vi.fn>;
        mockHistorical.mockResolvedValue([
            { date: new Date('2023-01-01'), close: 1.10 }
        ]);

        const rates = await getHistoricalFxRates('EUR', 'USD', new Date('2023-01-01'), new Date('2023-01-02'));

        expect(mockHistorical).toHaveBeenCalledWith('EURUSD=X', expect.anything());
        expect(rates[0].rate).toBe(1.10);
    });

    it('requests correct ticker for SGD -> USD (Inversion of SGD=X)', async () => {
        const mockHistorical = yahooFinance.historical as unknown as ReturnType<typeof vi.fn>;
        // SGD=X returns 1.34 (SGD per USD)
        mockHistorical.mockResolvedValue([
            { date: new Date('2023-01-01'), close: 1.34 }
        ]);

        // We want SGD -> USD.
        // 1 SGD = (1/1.34) USD
        const rates = await getHistoricalFxRates('SGD', 'USD', new Date('2023-01-01'), new Date('2023-01-02'));

        expect(mockHistorical).toHaveBeenCalledWith('SGD=X', expect.anything());
        expect(rates[0].rate).toBeCloseTo(1 / 1.34, 4);
    });
});
