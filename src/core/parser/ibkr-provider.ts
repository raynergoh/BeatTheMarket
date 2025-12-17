
import { PortfolioProvider, UnifiedPortfolio, ParsedFlexReport } from '../types';
import { parseFlexReport } from './ibkr-logic';
import { AssetFactory } from './asset-factory';

export class IbkrProvider implements PortfolioProvider {
    name = 'Interactive Brokers XML';

    parse(xmlContent: string): UnifiedPortfolio {
        // 1. Parse raw XML using existing logic
        const report: ParsedFlexReport = parseFlexReport(xmlContent);

        // 2. Normalize Assets
        const assets = report.openPositions.map(p => AssetFactory.createFromIbkr(p));

        // 2b. Enhance with Granular Cash Reports if available
        if (report.cashReports && report.cashReports.length > 0) {
            // Remove generic 'CASH' position if it exists (to avoid double counting with detailed reports)
            // 'ibkr-logic' might have added a fallback 'CASH' asset. We must remove it if we have granular details.
            for (let i = assets.length - 1; i >= 0; i--) {
                if (assets[i].assetClass === 'CASH' && (assets[i].symbol === 'CASH' || assets[i].symbol === report.baseCurrency)) {
                    // Logic: If the synthesized generic CASH is just the total base summary, we prefer granular.
                    // But check if granular sum approx equals this? For now, we trust granular if present.
                    assets.splice(i, 1);
                }
            }

            // Add granular cash assets
            report.cashReports.forEach((cr) => {
                if (Math.abs(cr.totalCash) > 0.01) {
                    assets.push({
                        symbol: cr.currency, // e.g. 'SGD'
                        description: `Cash (${cr.currency})`,
                        assetClass: 'CASH',
                        quantity: cr.totalCash,
                        marketValue: cr.totalCash, // In Local Currency
                        currency: cr.currency, // This is usually correct for the asset
                        originalCurrency: cr.currency, // Explicitly set for CashHoldings breakdown
                        getCollateralValue: () => cr.totalCash
                    });
                }
            });
        }

        // 3. Extract Cash Balance (Base Currency)
        // We defer total cash calculation to the Merger/Consumer who has FX rates.
        // But for this single portfolio, we might want to sum it up if we have a base currency context.
        // However, IbkrProvider is synchronous and lacks rates.
        // We will leave cashBalance as 0 or sum only Base Currency cash?
        // UnifiedPortfolio.cashBalance usually implies Total Cash Value in Base.
        // If we can't compute it accurately without rates, we might set it to just the Base Currency Portion?
        // OR we rely on the generic 'CASH' position from EquitySummary (which IBKR calculates in Base).
        // Since we REMOVED it from assets list, we should capture its value first!
        // Wait, `ibkr-logic` synthesizes 'CASH' from EquitySummary which IS in Base.
        // So `cashPos` (found before splice) has the correct Total Cash in Base.

        let cashBalance = 0;
        // Find the generic cash pos from IBKR's summary (which handles FX sum)
        const summaryCashPos = report.openPositions.find(p => p.assetCategory === 'CASH' || p.symbol === 'CASH');
        if (summaryCashPos) {
            cashBalance = summaryCashPos.value; // Use 'value' which is usually in Base
        } else if (report.equitySummary.length > 0) {
            // Fallback
            const lastEq = report.equitySummary[report.equitySummary.length - 1];
            cashBalance = lastEq.cash || 0;
        }

        // 4. Map Equity History
        const equityHistory = report.equitySummary ? report.equitySummary.map(e => ({
            date: e.reportDate,
            nav: e.total // This is already in 'Base' currency if normalized, but ibkr-logic just parses.
            // Ideally, we assume ibkr-logic returns what is in the XML.
            // The Merger will handle Currency normalization across portfolios.
        })) : [];

        // 5. Map Cash Flows (Net Invested Only)
        // We rely on 'isNetInvestedFlow' flag set by parseCashTransactions
        const cashFlows = report.cashTransactions
            .filter(t => t.isNetInvestedFlow)
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

        return {
            assets,
            cashBalance,
            baseCurrency: report.baseCurrency,
            transactions: report.cashTransactions,
            equityHistory,
            cashFlows,
            metadata: {
                provider: 'IBKR',
                asOfDate: report.toDate, // Using report end date
                accountId: report.accountId
            }
        };
    }
}
