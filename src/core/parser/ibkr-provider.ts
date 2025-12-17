
import { PortfolioProvider, UnifiedPortfolio, ParsedFlexReport, Asset } from '../types';
import { parseFlexReport } from './ibkr-logic';
import { AssetFactory } from './asset-factory';

export class IbkrProvider implements PortfolioProvider {
    name = 'Interactive Brokers XML';

    /**
     * Parse raw IBKR XML content into a UnifiedPortfolio.
     * This is the primary entry point for live Flex Query data.
     */
    parse(xmlContent: string): UnifiedPortfolio {
        const report: ParsedFlexReport = parseFlexReport(xmlContent);
        return IbkrProvider.mapToUnified(report, 'IBKR');
    }

    /**
     * Convert an already-parsed JSON report (from localStorage/manual upload) to UnifiedPortfolio.
     * This ensures manual uploads use the exact same logic as live token syncs.
     */
    static fromParsedReport(report: ParsedFlexReport, providerLabel: string = 'IBKR-Manual'): UnifiedPortfolio {
        return IbkrProvider.mapToUnified(report, providerLabel);
    }

    /**
     * Core mapping logic: converts ParsedFlexReport to UnifiedPortfolio.
     * Used by both parse() and fromParsedReport() to ensure consistency.
     */
    private static mapToUnified(report: ParsedFlexReport, providerLabel: string): UnifiedPortfolio {
        // 1. Normalize Assets via Factory
        const assets: Asset[] = (report.openPositions || []).map(p => AssetFactory.createFromIbkr(p));

        // 2. Enhance with Granular Cash Reports if available
        if (report.cashReports && report.cashReports.length > 0) {
            // Remove generic 'CASH' position to avoid double counting with detailed reports
            for (let i = assets.length - 1; i >= 0; i--) {
                if (assets[i].assetClass === 'CASH' && (assets[i].symbol === 'CASH' || assets[i].symbol === report.baseCurrency)) {
                    assets.splice(i, 1);
                }
            }

            // Add granular cash assets by currency
            report.cashReports.forEach((cr) => {
                if (Math.abs(cr.totalCash) > 0.01) {
                    assets.push({
                        symbol: cr.currency,
                        description: `Cash (${cr.currency})`,
                        assetClass: 'CASH',
                        quantity: cr.totalCash,
                        marketValue: cr.totalCash,
                        currency: cr.currency,
                        originalCurrency: cr.currency,
                        getCollateralValue: () => cr.totalCash
                    });
                }
            });
        }

        // 3. Cash Balance: Set to 0
        // IMPORTANT: Cash is already included as individual CASH assets above.
        // Setting cashBalance here would cause double-counting in net worth calculations.
        const cashBalance = 0;

        // 4. Map Equity History
        const equityHistory = (report.equitySummary || []).map(e => ({
            date: e.reportDate,
            nav: e.total
        }));

        // 5. Map Cash Flows (Net Invested Only)
        // Use isNetInvestedFlow flag if available, with fallback logic for older data
        const cashFlows = (report.cashTransactions || [])
            .filter(t =>
                t.isNetInvestedFlow ||
                (t.type === 'Deposits/Withdrawals' &&
                    ['Deposit', 'Withdrawal', 'Electronic Fund Transfer'].some(k => t.description?.includes(k))) ||
                t.type === 'Transfer'
            )
            .map(t => ({
                date: t.date,
                amount: t.amount,
                type: (t.amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL') as 'DEPOSIT' | 'WITHDRAWAL',
                currency: t.currency,
                id: (t as any).transactionId || t.transactionId,
                description: t.description,
                originalAmount: t.amount,
                originalCurrency: t.currency
            }));

        // 6. Infer Base Currency
        // Use EquitySummary.currency as source of truth (most reliable)
        let baseCurrency = report.baseCurrency || 'USD';
        if (report.equitySummary && report.equitySummary.length > 0) {
            const eqCurrency = report.equitySummary[0].currency;
            if (eqCurrency && eqCurrency !== baseCurrency) {
                baseCurrency = eqCurrency;
            }
        }

        return {
            assets,
            cashBalance,
            baseCurrency,
            transactions: report.cashTransactions || [],
            equityHistory,
            cashFlows,
            metadata: {
                provider: providerLabel,
                asOfDate: report.toDate,
                accountId: report.accountId
            }
        };
    }
}
