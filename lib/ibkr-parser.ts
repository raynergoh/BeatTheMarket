import { XMLParser } from 'fast-xml-parser';

export interface CashTransaction {
    amount: number;
    currency: string;
    date: string; // YYYY-MM-DD
    description: string;
    type?: string; // e.g. "Deposits/Withdrawals", "Dividends"
    transactionId?: string; // for deduplication
    fxRateToBase?: number; // For converting non-USD deposits
    levelOfDetail?: string; // 'SUMMARY' or 'DETAIL'
}

export interface OpenPosition {
    symbol: string;
    quantity: number;
    costBasisPrice: number;
    costBasisMoney: number;
    markPrice: number;
    value: number;
    currency: string;
    percentOfNAV: number;
    levelOfDetail?: string; // 'SUMMARY' | 'LOT'
    assetCategory?: string; // 'STK', 'CASH', etc.
}

export interface EquitySummary {
    reportDate: string; // YYYY-MM-DD
    total: number;
    cash?: number;
    currency?: string;
}

export interface CashReport {
    currency: string;
    totalCash: number;
    settledCash: number;
    accruedCash: number;
}

export interface PortfolioData {
    date: string;
    portfolioValue: number;
    benchmarkValue: number;
    totalInvested: number;
}

export function parseIBKRXml(xmlContent: string): { cashTransactions: CashTransaction[], openPositions: OpenPosition[], equitySummary: EquitySummary[], fromDate: string, toDate: string, baseCurrency: string, cashReports: CashReport[] } {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
    });

    const parsed = parser.parse(xmlContent);

    // Debugging: Check if it actually looks like XML
    if (!xmlContent.trim().startsWith('<')) {
        console.error('Received content does not look like XML:', xmlContent.substring(0, 100));
        throw new Error('Received data is not XML. Please ensure your Flex Query format is set to "XML" in IBKR Settings.');
    }

    // Helper to ensure array even if single item or undefined
    const toArray = (item: any) => {
        if (!item) return [];
        return Array.isArray(item) ? item : [item];
    };

    // Helper to format YYYYMMDD to YYYY-MM-DD
    const formatIbkrDate = (dateStr: string) => {
        if (!dateStr || dateStr.length !== 8) return dateStr;
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    };

    // Navigate the XML structure
    const flexQueryResponse = parsed.FlexQueryResponse;
    if (!flexQueryResponse) {
        console.error('Parsed Object Keys:', Object.keys(parsed));
        if (parsed.FlexStatementResponse) {
            throw new Error(`IBKR Error: ${parsed.FlexStatementResponse.ErrorMessage || 'Check logs'}`);
        }
        throw new Error(`Invalid IBKR XML. Expected FlexQueryResponse, found: ${Object.keys(parsed).join(', ')}`);
    }

    const flexStatements = toArray(flexQueryResponse.FlexStatements?.FlexStatement);

    let cashTransactions: CashTransaction[] = [];
    let allRawPositions: any[] = [];

    // Iterate over statements (usually just one) and collect raw data
    for (const statement of flexStatements) {
        // Extract CashTransactions
        const cashTrans = toArray(statement.CashTransactions?.CashTransaction);
        for (const ct of cashTrans) {
            const dateStr = ct.dateTime ? ct.dateTime.split(/[\s;]/)[0] : '';
            cashTransactions.push({
                amount: parseFloat(ct.amount),
                currency: ct.currency,
                date: dateStr,
                description: ct.description,
                type: ct.type,
                transactionId: ct.transactionID,
                fxRateToBase: parseFloat(ct.fxRateToBase || '1'),
                levelOfDetail: ct.levelOfDetail
            });
        }

        // Collect raw OpenPositions for filtering later
        const positions = toArray(statement.OpenPositions?.OpenPosition);
        allRawPositions = allRawPositions.concat(positions);
    }

    // Filter Logic for Positions:
    // 1. Prefer "SUMMARY" for Stocks/Equities.
    // 2. Ensure we capture "CASH" positions (which might not be labeled SUMMARY or might be in a separate category).

    const summaryPositions = allRawPositions.filter((p: any) => p.levelOfDetail === 'SUMMARY');

    // Identify Cash Positions in Raw Data
    // IBKR often labels cash with assetCategory="CASH" or symbol="CASH" or currency code
    const isCashRaw = (p: any) => p.assetCategory === 'CASH' || p.symbol === 'CASH' || p.symbol === 'USD' || p.symbol === 'SGD' || (p.symbol && p.symbol.includes('.'));

    const rawCashPositions = allRawPositions.filter(isCashRaw);

    let positionsToUse = [];

    if (summaryPositions.length > 0) {
        positionsToUse = [...summaryPositions];

        // Check if we missed cash in the summary
        const summaryHasCash = summaryPositions.some(isCashRaw);
        if (!summaryHasCash && rawCashPositions.length > 0) {
            // Add raw cash positions if not present in summary
            // Deduplicate in case of overlap (though check above handles 'hasCash' broadly)
            positionsToUse = [...positionsToUse, ...rawCashPositions];
        }
    } else {
        positionsToUse = allRawPositions;
    }

    // Deduplicate by symbol+currency just in case
    const uniquePosMap = new Map();
    positionsToUse.forEach((p: any) => {
        const key = `${p.symbol}-${p.currency}`;
        if (!uniquePosMap.has(key)) {
            uniquePosMap.set(key, p);
        }
    });

    positionsToUse = Array.from(uniquePosMap.values());

    const openPositions: OpenPosition[] = positionsToUse.map((pos: any) => ({
        symbol: pos.symbol,
        quantity: parseFloat(pos.position),
        costBasisPrice: parseFloat(pos.costBasisPrice),
        costBasisMoney: parseFloat(pos.costBasisMoney),
        markPrice: parseFloat(pos.markPrice),
        value: parseFloat(pos.positionValue), // Use positionValue as value
        currency: pos.currency,
        percentOfNAV: parseFloat(pos.percentOfNAV || '0'),
        levelOfDetail: pos.levelOfDetail,
        assetCategory: pos.assetCategory
    }));

    // Extract Equity Summary (Portfolio History)
    // Extract Equity Summary (Portfolio History)
    // Try 'EquitySummaryByReportDateInBase' first, then 'NetAssetValueInBase' (common alternative)
    let equitySummary: EquitySummary[] = [];

    // Check for Equity Summary
    for (const statement of flexStatements) {
        // Option A: EquitySummaryByReportDateInBase
        // XML Structure: <EquitySummaryInBase><EquitySummaryByReportDateInBase .../></EquitySummaryInBase>
        // Sometimes it might be <EquitySummary><EquitySummaryByReportDate .../></EquitySummary>

        // Check for EquitySummaryInBase (User's Case)
        let equityList = toArray(statement.EquitySummaryInBase?.EquitySummaryByReportDateInBase);
        // Attempt to capture currency from parent tag
        let currency = statement.EquitySummaryInBase?.currency || 'USD';

        // Fallback: Check for EquitySummaryByReportDateInBase (Old/Alternate Case)
        if (equityList.length === 0) {
            equityList = toArray(statement.EquitySummaryByReportDateInBase?.EquitySummaryByReportDateInBase);
            // If explicit parent had no currency, maybe this one does? (unlikely structure mismatch, but safe fallback)
            // Ideally we check statement.EquitySummaryByReportDateInBase?.currency too if strictly needed.
            // But 'USD' is decent default if missing.
        }

        for (const item of equityList) {
            equitySummary.push({
                reportDate: formatIbkrDate(item.reportDate),
                total: parseFloat(item.total),
                cash: parseFloat(item.cash || '0'),
                currency: currency
            });
        }

        // Option B: NetAssetValueInBase (if Option A is empty)
        if (equityList.length === 0) {
            // Try InBase first
            let navList = toArray(statement.NetAssetValueInBase?.NetAssetValueInBase);
            let navCurrency = statement.NetAssetValueInBase?.currency || 'USD';

            // If empty, try generic NetAssetValue (maybe user didn't select In Base)
            if (navList.length === 0) {
                navList = toArray(statement.NetAssetValue?.NetAssetValue);
                navCurrency = statement.NetAssetValue?.currency || 'USD';
            }

            for (const item of navList) {
                const val = parseFloat(item.total || item.netLiquidation || item.nav || item.amount || '0');
                equitySummary.push({
                    reportDate: formatIbkrDate(item.reportDate || item.date), // 'date' is sometimes used
                    total: val,
                    cash: parseFloat(item.cash || '0'), // Try to get cash if available in NAV too
                    currency: navCurrency
                });
            }
        }
    }


    // Synthesize Cash Position from latest Equity Summary if not present in Positions
    if (equitySummary.length > 0) {
        // Find latest entry
        const latestEquity = equitySummary.reduce((latest, current) => {
            return (current.reportDate > latest.reportDate) ? current : latest;
        }, equitySummary[0]);

        if (latestEquity.cash && latestEquity.cash !== 0) {
            // Check if we already have a generic "CASH" or currency position?
            // Usually IBKR positions might list currency like "USD" but assetCategory might be "CASH".
            // For safety, let's look for symbol 'CASH' or 'USD'/'SGD'.
            const hasCashPos = openPositions.some(p => p.symbol === 'CASH' || p.symbol === 'USD' || p.symbol === 'SGD'); // Simple heuristic

            if (!hasCashPos) {
                openPositions.push({
                    symbol: 'CASH',
                    quantity: latestEquity.cash,
                    costBasisPrice: 1,
                    costBasisMoney: latestEquity.cash,
                    markPrice: 1,
                    value: latestEquity.cash,
                    currency: latestEquity.currency || 'USD',
                    percentOfNAV: 0, // calc later or ignore
                    levelOfDetail: 'SUMMARY',
                    assetCategory: 'CASH'
                });
            }
        }
    }



    // Extract Report Metadata (fromDate/toDate)
    let fromDate = '';
    let toDate = '';
    let baseCurrency = 'USD'; // Default

    if (flexStatements.length > 0) {
        // Usually attributes are directly on the statement object if using fast-xml-parser with ignoreAttributes: false
        // The parser usually prefixes attributes, but we set attributeNamePrefix: ""
        const stmt = flexStatements[0];
        fromDate = formatIbkrDate(stmt.fromDate || '');
        toDate = formatIbkrDate(stmt.toDate || '');

        // Try to detect base currency from statement or equity summary sections
        // Option 1: Statement level (sometimes present)
        if (stmt.currency) baseCurrency = stmt.currency;

        // Option 2: EquitySummaryInBase currency attribute
        // <EquitySummaryInBase currency="SGD">
        else if (stmt.EquitySummaryInBase?.currency) baseCurrency = stmt.EquitySummaryInBase.currency;

        // Option 3: NetAssetValueInBase currency attribute
        else if (stmt.NetAssetValueInBase?.currency) baseCurrency = stmt.NetAssetValueInBase.currency;

        // Option 4: Check if we have any equity summary items with currency
        else if (equitySummary.length > 0 && equitySummary[0].currency) {
            baseCurrency = equitySummary[0].currency;
        }
    }

    // Extract Cash Report (for accurate currency breakdown)
    // <CashReport currency="AUD" totalCommissions="..." totalCash="..." ... />
    let cashReports: CashReport[] = [];
    if (flexStatements.length > 0) {
        flexStatements.forEach(statement => {
            const reportWrapper = statement.CashReport;
            if (reportWrapper) {
                const reports = toArray(reportWrapper.CashReportCurrency);
                reports.forEach((r: any) => {
                    // Filter out BASE_SUMMARY if present, as it overlaps with specific currencies
                    if (r.currency === 'BASE_SUMMARY') return;

                    cashReports.push({
                        currency: r.currency,
                        totalCash: parseFloat(r.totalCash || r.endingCash || '0'),
                        settledCash: parseFloat(r.settledCash || r.endingSettledCash || r.endingCash || '0'),
                        accruedCash: parseFloat(r.accruedCash || '0')
                    });
                });
            }
        });
    }

    return { cashTransactions, openPositions, equitySummary, fromDate, toDate, baseCurrency, cashReports };
}
