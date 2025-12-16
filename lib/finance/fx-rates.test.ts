import { describe, it, expect, vi } from 'vitest';
import { getHistoricalFxRates } from './fx-rates';
import * as YahooFinanceLib from '../yahoo-finance';

// Mock the 'getHistoricalPrices' wrapper function directly
// This avoids issues with mocking the 'yahoo-finance2' library's default export class instantiation
vi.mock('../yahoo-finance', () => ({
    getHistoricalPrices: vi.fn(),
}));

describe('getHistoricalFxRates', () => {
    it('returns empty array if source equals target', async () => {
        const rates = await getHistoricalFxRates('USD', 'USD', new Date(), new Date());
        expect(rates).toEqual([]);
    });

    it('requests correct ticker for USD -> SGD', async () => {
        const mockGetPrices = YahooFinanceLib.getHistoricalPrices as unknown as ReturnType<typeof vi.fn>;
        mockGetPrices.mockResolvedValue([
            { date: '2023-01-01', close: 1.34 }
        ]);

        const rates = await getHistoricalFxRates('USD', 'SGD', new Date('2023-01-01'), new Date('2023-01-02'));

        // The implementation constructs ticker as `${base}${target}=X`
        expect(mockGetPrices).toHaveBeenCalledWith('USDSGD=X', expect.anything(), expect.anything());
        expect(rates[0].rate).toBe(1.34);
    });

    it('requests correct ticker logic for EUR -> USD', async () => {
        const mockGetPrices = YahooFinanceLib.getHistoricalPrices as unknown as ReturnType<typeof vi.fn>;
        mockGetPrices.mockResolvedValue([
            { date: '2023-01-01', close: 1.10 }
        ]);

        const rates = await getHistoricalFxRates('EUR', 'USD', new Date('2023-01-01'), new Date('2023-01-02'));

        expect(mockGetPrices).toHaveBeenCalledWith('EURUSD=X', expect.anything(), expect.anything());
        expect(rates[0].rate).toBe(1.10);
    });
});
