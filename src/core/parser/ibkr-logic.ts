
import { ParsedFlexReport, SecurityInfo, EquitySummary, CashReport, Transfer, CashTransaction, OpenPosition } from '../types';
import { parseXML, toArray, formatIbkrDate } from './xml-utils';
import { parseCashTransactions } from './cash-flows';
import { parseTransfers, transfersToCashTransactions } from './transfers';
import { parseOpenPositions } from './positions';
import { ASSET_CATEGORIES } from '../constants';

export function parseFlexReport(xmlContent: string): ParsedFlexReport {
    const parsed = parseXML(xmlContent);
    const flexStatements = toArray(parsed.FlexQueryResponse.FlexStatements?.FlexStatement);

    let cashTransactions: CashTransaction[] = [];
    let transfers: Transfer[] = [];
    let securitiesInfo: SecurityInfo[] = [];
    let openPositions: OpenPosition[] = [];
    let equitySummary: EquitySummary[] = [];
    let cashReports: CashReport[] = [];

    // Global Maps
    const securitiesMap = new Map<string, number>();

    // Pass 1: Security Info from all statements
    for (const statement of flexStatements) {
        const rawSecurities = [
            ...toArray(statement.SecuritiesInfo?.SecurityInfo),
            ...toArray(statement.FinancialInstrumentInformation?.FinancialInstrumentInformation)
        ];

        for (const s of rawSecurities) {
            const multiplier = parseFloat(s.multiplier || '1');
            if (s.symbol) securitiesMap.set(s.symbol, multiplier);

            securitiesInfo.push({
                symbol: s.symbol,
                currency: s.currency,
                assetCategory: s.assetCategory,
                multiplier: multiplier,
                description: s.description
            });
        }
    }

    // Pass 2: Process Statements
    for (const statement of flexStatements) {
        // Cash Txs
        cashTransactions.push(...parseCashTransactions(statement));

        // Transfers
        const trs = parseTransfers(statement);
        transfers.push(...trs);

        // Merge Transfers into Cash Txs
        cashTransactions.push(...transfersToCashTransactions(trs));

        // Positions
        // Pass the securitiesMap to parseOpenPositions as it expects (Map<string, number>)
        openPositions.push(...parseOpenPositions(statement, securitiesMap));

        // Equity Summary
        equitySummary.push(...parseEquitySummary(statement));

        // Cash Reports
        cashReports.push(...parseCashReports(statement));
    }

    // Synthesize Cash Position from latest Equity Summary if missing (Fallback)
    // Ensures basic cash balance exists even if granular reports are missing
    if (equitySummary.length > 0) {
        // Find latest report date
        const latestEquity = equitySummary.reduce((latest, current) => {
            return (current.reportDate > latest.reportDate) ? current : latest;
        }, equitySummary[0]);

        if (latestEquity.cash && latestEquity.cash !== 0) {
            const hasCashPos = openPositions.some(p => p.assetCategory === ASSET_CATEGORIES.CASH || p.symbol === 'CASH');
            if (!hasCashPos) {
                openPositions.push({
                    symbol: 'CASH',
                    quantity: latestEquity.cash,
                    costBasisPrice: 1,
                    costBasisMoney: latestEquity.cash,
                    markPrice: 1,
                    value: latestEquity.cash,
                    currency: latestEquity.currency || 'USD',
                    percentOfNAV: 0,
                    levelOfDetail: 'SUMMARY',
                    assetCategory: 'CASH'
                });
            }
        }
    }

    // Sort valid history by date ascending
    equitySummary.sort((a, b) => a.reportDate.localeCompare(b.reportDate));

    // Extract Metadata from first statement or default
    const baseCurrency = flexStatements.length > 0 ? (flexStatements[0].accountCurrency || flexStatements[0].currencyCode || flexStatements[0].currency || 'USD') : 'USD';
    const fromDate = flexStatements.length > 0 ? formatIbkrDate(flexStatements[0].fromDate || '') : '';
    const toDate = flexStatements.length > 0 ? formatIbkrDate(flexStatements[0].toDate || '') : '';

    return {
        cashTransactions,
        openPositions,
        equitySummary,
        fromDate,
        toDate,
        baseCurrency,
        cashReports,
        transfers,
        securitiesInfo,
        accountId: flexStatements.length > 0 ? flexStatements[0].accountId : undefined
    };
}

// Helpers

function parseEquitySummary(statement: any): EquitySummary[] {
    const summary: EquitySummary[] = [];

    // Option A: EquitySummaryInBase
    let equityList = toArray(statement.EquitySummaryInBase?.EquitySummaryByReportDateInBase);
    let currency = statement.EquitySummaryInBase?.currencyCode || statement.EquitySummaryInBase?.currency || 'USD';

    // Fallback: Option B
    if (equityList.length === 0) {
        equityList = toArray(statement.EquitySummaryByReportDateInBase?.EquitySummaryByReportDateInBase);
    }

    // Check Option C: NetAssetValueInBase (if A/B empty)
    if (equityList.length === 0) {
        const navList = toArray(statement.NetAssetValueInBase?.NetAssetValueInBase || statement.NetAssetValue?.NetAssetValue);
        // currency might be on the statement level if not on block

        for (const item of navList) {
            summary.push({
                reportDate: formatIbkrDate(item.reportDate || item.date),
                total: parseFloat(item.total || item.netLiquidation || item.nav || item.amount || '0'),
                cash: parseFloat(item.cash || '0'),
                currency: item.currency || currency,
                accountId: item.accountId || statement.accountId,
                dividendAccruals: parseFloat(item.dividendAccruals || '0'),
                interestAccruals: parseFloat(item.interestAccruals || '0')
            });
        }
        return summary;
    }

    for (const item of equityList) {
        summary.push({
            reportDate: formatIbkrDate(item.reportDate),
            total: parseFloat(item.total),
            cash: parseFloat(item.cash || '0'),
            currency: item.currency || currency,
            accountId: item.accountId || statement.accountId,
            dividendAccruals: parseFloat(item.dividendAccruals || '0'),
            interestAccruals: parseFloat(item.interestAccruals || '0')
        });
    }

    return summary;
}

function parseCashReports(statement: any): CashReport[] {
    const reports: CashReport[] = [];
    const reportWrapper = statement.CashReport;
    if (reportWrapper) {
        const rawReports = toArray(reportWrapper.CashReportCurrency);
        rawReports.forEach((r: any) => {
            if (r.currency === 'BASE_SUMMARY') return; // Skip summary row if strictly parsing currency breakdowns
            // Some reports use 'currencyCode', some 'currency'
            const currency = r.currencyCode || r.currency;
            if (!currency) return;

            reports.push({
                currency: currency,
                totalCash: parseFloat(r.total || r.endingCash || '0'),
                settledCash: parseFloat(r.settledCash || r.endingSettledCash || '0'),
                accruedCash: parseFloat(r.accruedCash || '0')
            });
        });
    }
    return reports;
}
