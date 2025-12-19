import { PortfolioMerger } from '@/src/core/utils/portfolio-merger';
import { UnifiedPortfolio } from '@/src/core/types';

/**
 * Unit Test: Two-Phase Portfolio Merging with Composite Keys
 * 
 * This test validates the core requirement:
 * - Phase 1: Stitch same provider+accountId portfolios across time
 * - Phase 2: Sum different accounts into one master portfolio
 */

describe('PortfolioMerger - Two-Phase Composite Key Logic', () => {
    /**
     * Helper function to create a mock portfolio
     */
    function createMockPortfolio(
        provider: string,
        accountId: string,
        asOfDate: string,
        nav: number,
        baseCurrency: string = 'USD'
    ): UnifiedPortfolio {
        return {
            assets: [
                {
                    symbol: 'MOCK',
                    description: `Mock Asset for ${accountId}`,
                    assetClass: 'STOCK',
                    quantity: nav / 100,
                    marketValue: nav,
                    currency: baseCurrency,
                    getCollateralValue: () => nav
                }
            ],
            cashBalance: 0,
            baseCurrency,
            transactions: [],
            equityHistory: [{ date: asOfDate, nav }],
            cashFlows: [
                {
                    date: asOfDate,
                    amount: nav,
                    type: 'DEPOSIT',
                    currency: baseCurrency
                }
            ],
            metadata: {
                provider,
                asOfDate,
                accountId
            }
        };
    }

    it('should stitch same account across time, then sum different accounts', async () => {
        // Scenario: User uploads 3 files
        // 1. IBKR Account U123 from 2023
        // 2. IBKR Account U123 from 2024 (should stitch with #1)
        // 3. IBKR Account U456 from 2024 (separate account, should sum with stitched U123)

        const accountA_2023 = createMockPortfolio('IBKR', 'U123', '2023-12-31', 10000);
        const accountA_2024 = createMockPortfolio('IBKR', 'U123', '2024-12-31', 15000);
        const accountB_2024 = createMockPortfolio('IBKR', 'U456', '2024-12-31', 5000);

        const result = await PortfolioMerger.merge([accountA_2023, accountA_2024, accountB_2024], 'USD');

        // Assert: Sources should show 2 unique accounts
        expect(result.portfolio.metadata.sources).toHaveLength(2); // IBKR::U123, IBKR::U456

        const sources = result.portfolio.metadata.sources!;
        expect(sources.some(s => s.accountId === 'U123')).toBe(true);
        expect(sources.some(s => s.accountId === 'U456')).toBe(true);

        // Assert: Equity history should contain dates from both years
        const equityDates = result.portfolio.equityHistory.map(e => e.date);
        expect(equityDates).toContain('2023-12-31'); // From A_2023
        expect(equityDates).toContain('2024-12-31'); // Combined A_2024 + B_2024

        // Assert: NAV on 2024-12-31 should be SUM of both accounts
        const nav2024 = result.portfolio.equityHistory.find(e => e.date === '2024-12-31');
        expect(nav2024).toBeDefined();
        expect(nav2024!.nav).toBe(15000 + 5000); // 20000

        // Assert: NAV on 2023-12-31 should only be from Account A
        const nav2023 = result.portfolio.equityHistory.find(e => e.date === '2023-12-31');
        expect(nav2023).toBeDefined();
        expect(nav2023!.nav).toBe(10000); // Only Account A existed
    });

    it('should treat same accountId from different providers as separate accounts', async () => {
        // Critical Test: Prevent accountId collision across brokers
        // IBKR Account "12345" should NOT merge with Schwab Account "12345"

        const ibkr_12345 = createMockPortfolio('IBKR', '12345', '2024-12-31', 10000);
        const schwab_12345 = createMockPortfolio('SCHWAB', '12345', '2024-12-31', 8000);

        const result = await PortfolioMerger.merge([ibkr_12345, schwab_12345], 'USD');

        // Assert: Should have 2 unique sources (not stitched)
        expect(result.portfolio.metadata.sources).toHaveLength(2);

        const sources = result.portfolio.metadata.sources!;
        expect(sources.some(s => s.provider === 'IBKR' && s.accountId === '12345')).toBe(true);
        expect(sources.some(s => s.provider === 'SCHWAB' && s.accountId === '12345')).toBe(true);

        // Assert: NAV should be SUM (not overwrite)
        const nav = result.portfolio.equityHistory.find(e => e.date === '2024-12-31');
        expect(nav!.nav).toBe(18000); // 10000 + 8000
    });

    it('should handle single portfolio without modification', async () => {
        const single = createMockPortfolio('IBKR', 'U123', '2024-12-31', 10000);

        const result = await PortfolioMerger.merge([single], 'USD');

        // Assert: Should keep original provider and accountId
        expect(result.portfolio.metadata.provider).toBe('IBKR');
        expect(result.portfolio.metadata.accountId).toBe('U123');

        // Assert: Sources should contain single entry
        expect(result.portfolio.metadata.sources).toHaveLength(1);
        expect(result.portfolio.metadata.sources![0].accountId).toBe('U123');
    });

    it('should handle multi-currency stitching and summation', async () => {
        // Scenario: Same account with SGD, different account with USD
        const sgd_A_2023 = createMockPortfolio('IBKR', 'U123', '2023-12-31', 10000, 'SGD');
        const sgd_A_2024 = createMockPortfolio('IBKR', 'U123', '2024-12-31', 15000, 'SGD');
        const usd_B_2024 = createMockPortfolio('IBKR', 'U456', '2024-12-31', 5000, 'USD');

        const result = await PortfolioMerger.merge([sgd_A_2023, sgd_A_2024, usd_B_2024], 'USD');

        // Assert: All values normalized to USD
        expect(result.portfolio.baseCurrency).toBe('USD');

        // Assert: Sources show both accounts
        expect(result.portfolio.metadata.sources).toHaveLength(2);
    });

    it('should preserve sources metadata through stitching', async () => {
        // Scenario: 3 files for same account (should stitch into one source entry)
        const file1 = createMockPortfolio('IBKR', 'U123', '2021-12-31', 5000);
        const file2 = createMockPortfolio('IBKR', 'U123', '2022-12-31', 8000);
        const file3 = createMockPortfolio('IBKR', 'U123', '2023-12-31', 12000);

        const result = await PortfolioMerger.merge([file1, file2, file3], 'USD');

        // Assert: Final aggregated portfolio shows ONE unique account
        // (not 3 individual files - those are tracked in the intermediate stitched portfolio)
        expect(result.portfolio.metadata.sources).toHaveLength(1);
        expect(result.portfolio.metadata.sources![0].accountId).toBe('U123');

        // Assert: Equity history should have 3 dates from the stitched files
        expect(result.portfolio.equityHistory).toHaveLength(3);
    });

    it('should handle empty portfolio array', async () => {
        const result = await PortfolioMerger.merge([], 'USD');

        expect(result.portfolio.assets).toHaveLength(0);
        expect(result.portfolio.equityHistory).toHaveLength(0);
        expect(result.portfolio.metadata.provider).toBe('EMPTY');
    });
});
