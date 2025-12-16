import { XMLParser } from 'fast-xml-parser';

export type CashFlowCategory = 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | 'INTEREST' | 'FEE' | 'OTHER';

export interface CashTransaction {
    amount: number;
    currency: string;
    date: string; // YYYY-MM-DD
    description: string;
    type?: string; // e.g. "Deposits/Withdrawals", "Dividends"
    transactionId?: string; // for deduplication
    fxRateToBase?: number; // For converting non-USD deposits
    levelOfDetail?: string; // 'SUMMARY' or 'DETAIL'
    accountId?: string;
    acctAlias?: string;
    // New Fields
    category: CashFlowCategory;
    isNetInvestedFlow: boolean;
}



export interface Transfer {
    transactionID: string;
    type: string; // "INTERNAL" etc
    direction: string; // "IN" or "OUT"
    amount: number; // cashTransfer
    date: string;
    currency: string;
    accountId: string;
    acctAlias?: string;
    fxRateToBase?: number;
}

export interface SecurityInfo {
    symbol: string;
    currency: string;
    assetCategory: string;
    multiplier: number;
    description: string;
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
    assetCategory?: string; // 'STK', 'CASH', 'OPT'
    putCall?: string; // 'P' or 'C'
    strike?: number;
    expiry?: string;
    multiplier?: number;
}

export interface EquitySummary {
    reportDate: string; // YYYY-MM-DD
    total: number;
    cash?: number;
    currency?: string;
    accountId?: string;
    dividendAccruals?: number;
    interestAccruals?: number;
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

export function parseIBKRXml(xmlContent: string): {
    cashTransactions: CashTransaction[],
    openPositions: OpenPosition[],
    equitySummary: EquitySummary[],
    fromDate: string,
    toDate: string,
    baseCurrency: string,
    cashReports: CashReport[],
    transfers: Transfer[],

    securitiesInfo: SecurityInfo[],
    accountId?: string
} {
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
        // Check for common error where user uploads a different XML type
        if (parsed.ActivityFlexQuery) {
            throw new Error('Incorrect XML Format. You uploaded the Query Definition, not the Report. Please RUN the query in IBKR and download the report.');
        }
        throw new Error(`Invalid IBKR XML. Expected FlexQueryResponse, found: ${Object.keys(parsed).join(', ')}`);
    }

    const flexStatements = toArray(flexQueryResponse.FlexStatements?.FlexStatement);

    let cashTransactions: CashTransaction[] = [];
    let transfers: Transfer[] = [];

    let securitiesInfo: SecurityInfo[] = [];
    let allRawPositions: any[] = [];

    // 1. First pass: Collect all Security Info to build a Multiplier Map
    const securitiesMap = new Map<string, number>(); // Symbol -> Multiplier

    for (const statement of flexStatements) {
        // Support both "SecuritiesInfo" and "FinancialInstrumentInformation" (IBKR variations)
        const rawSecurities = [
            ...toArray(statement.SecuritiesInfo?.SecurityInfo),
            ...toArray(statement.FinancialInstrumentInformation?.FinancialInstrumentInformation)
        ];

        for (const s of rawSecurities) {
            const multiplier = parseFloat(s.multiplier || '1');
            // Store by symbol. Note: handling potential duplicate symbols?
            // Usually symbol + assetCategory + currency is unique, but simple symbol might suffice for now if no conflicts.
            // For Options, symbol is usually specific like "AZN   251121P00080000"
            // We'll use symbol as key.
            if (s.symbol) {
                securitiesMap.set(s.symbol, multiplier);
            }

            securitiesInfo.push({
                symbol: s.symbol,
                currency: s.currency,
                assetCategory: s.assetCategory,
                multiplier: multiplier,
                description: s.description
            });
        }
    }

    // 2. Second pass: Transactions and Positions
    for (const statement of flexStatements) {
        // Extract CashTransactions
        const cashTrans = toArray(statement.CashTransactions?.CashTransaction);
        for (const ct of cashTrans) {
            const dateStr = ct.dateTime ? ct.dateTime.split(/[\s;]/)[0] : '';
            const amount = parseFloat(ct.amount);

            // Auto-Categorize
            let { category, isNetInvestedFlow } = categorizeCashTransaction(ct.type || '', ct.description || '');

            // Refine Category based on amount for Deposits/Withdrawals
            if (category === 'DEPOSIT' && amount < 0) category = 'WITHDRAWAL';

            cashTransactions.push({
                amount: amount,
                currency: ct.currency,
                date: formatIbkrDate(dateStr),
                description: ct.description,
                type: ct.type,
                transactionId: ct.transactionID,
                fxRateToBase: parseFloat(ct.fxRateToBase || '1'),
                levelOfDetail: ct.levelOfDetail,
                accountId: ct.accountId || statement.accountId,
                acctAlias: ct.acctAlias || statement.acctAlias,
                category,
                isNetInvestedFlow
            });
        }



        // Extract Transfers
        const rawTransfers = toArray(statement.Transfers?.Transfer);
        for (const t of rawTransfers) {
            const dateStr = t.date ? t.date : (t.reportDate ? t.reportDate : '');

            // Logic for Amount:
            // 1. Prioritize cashTransfer if it's non-zero (Actual Cash)
            // 2. Fallback to positionAmountInBase if it's an Asset Transfer (Cash Equivalent)
            let amount = parseFloat(t.cashTransfer || '0');
            if (amount === 0 && t.positionAmountInBase) {
                amount = parseFloat(t.positionAmountInBase);
            }

            transfers.push({
                transactionID: t.transactionID,
                type: t.type, // e.g. "INTERNAL"
                direction: t.direction, // "IN" or "OUT"
                amount: amount,
                date: formatIbkrDate(dateStr),
                currency: t.currency,
                accountId: t.accountId || statement.accountId,
                acctAlias: t.acctAlias || statement.acctAlias,
                fxRateToBase: parseFloat(t.fxRateToBase || '1')
            });

            // Merge into CashTransactions
            // Trust the sign from the XML.
            // If amount is negative, it's a withdrawal/liability-in.
            // If amount is positive, it's a deposit/liability-out.
            const flowAmount = amount;

            // Only merge if amount is non-zero to avoid noise
            if (amount !== 0) {
                cashTransactions.push({
                    amount: flowAmount,
                    currency: t.currency,
                    date: formatIbkrDate(dateStr),
                    description: `Transfer ${t.direction}: ${t.type}`,
                    type: t.type,
                    transactionId: t.transactionID,
                    fxRateToBase: parseFloat(t.fxRateToBase || '1'),
                    levelOfDetail: 'DETAIL',
                    accountId: t.accountId || statement.accountId,
                    acctAlias: t.acctAlias || statement.acctAlias,
                    category: flowAmount < 0 ? 'WITHDRAWAL' : 'DEPOSIT',
                    isNetInvestedFlow: true // Transfers usually count as Net Invested Capital changes
                });
            }
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
    // IBKR often labels cash with assetCategory="CASH"    // Helper to check if a position is effectively cash
    const isCashRaw = (p: any) => {
        // 1. Explicit asset category
        if (p.assetCategory === 'CASH') return true;
        // 2. Symbol is 'CASH'
        if (p.symbol === 'CASH') return true;
        // 3. Symbol looks like a currency code (3 uppercase letters) and no other complexity
        // Note: Some tickers might be 3 letters (like 'IBM'), but usually assetCategory would be 'STK'
        // If assetCategory is missing/ambiguous, we might need to be careful.
        // However, in IBKR XML, 'Cash' usually has assetCategory='CASH'.
        // This fallback is for when assetCategory might be weird or missing but it's clearly a currency.
        if (p.symbol && /^[A-Z]{3}$/.test(p.symbol) && (!p.assetCategory || p.assetCategory === 'CASH')) return true;
        // 4. Dot in symbol often implies forex pair in some contexts, but 'CASH' is usually clean.
        // Let's stick to the safer checks above. if p.symbol includes '.' it might be 'USD.CAD' which is a pair, not necessarily a cash balance entry?
        // Actually, IBKR Cash Balance entries usually have symbol='USD' and assetCategory='CASH'.

        return false;
    };

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

    const openPositions: OpenPosition[] = positionsToUse.map((pos: any) => {
        // Try to look up multiplier
        const multiplier = securitiesMap.get(pos.symbol) || parseFloat(pos.multiplier || '1');

        return {
            symbol: pos.symbol,
            quantity: parseFloat(pos.position),
            costBasisPrice: parseFloat(pos.costBasisPrice),
            costBasisMoney: parseFloat(pos.costBasisMoney),
            markPrice: parseFloat(pos.markPrice),
            value: parseFloat(pos.positionValue), // Use positionValue as value
            currency: pos.currency,
            percentOfNAV: parseFloat(pos.percentOfNAV || '0'),
            levelOfDetail: pos.levelOfDetail,
            assetCategory: pos.assetCategory,
            putCall: pos.putCall, // 'P' or 'C'
            strike: parseFloat(pos.strike || '0'),
            expiry: pos.expiry,
            multiplier: multiplier
        };
    });

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
                currency: item.currency || currency,
                accountId: item.accountId || statement.accountId,
                dividendAccruals: parseFloat(item.dividendAccruals || '0'),
                interestAccruals: parseFloat(item.interestAccruals || '0')
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
                    currency: navCurrency,
                    accountId: item.accountId || statement.accountId,
                    dividendAccruals: parseFloat(item.dividendAccruals || '0'),
                    interestAccruals: parseFloat(item.interestAccruals || '0')
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
            // Check if we already have a generic "CASH" or currency position?
            // Usually IBKR positions might list currency like "USD" but assetCategory might be "CASH".
            const hasCashPos = openPositions.some(p => p.assetCategory === 'CASH' || p.symbol === 'CASH' || (p.symbol && /^[A-Z]{3}$/.test(p.symbol) && p.assetCategory === 'CASH'));

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
        // Option 1: Check if we have any equity summary items with currency (Most Reliable as it comes from data rows)
        if (equitySummary.length > 0 && equitySummary[0].currency) {
            baseCurrency = equitySummary[0].currency;
        }
        // Option 2: Statement level (sometimes present)
        else if (stmt.currency) baseCurrency = stmt.currency;

        // Option 3: EquitySummaryInBase currency attribute
        else if (stmt.EquitySummaryInBase?.currency) baseCurrency = stmt.EquitySummaryInBase.currency;

        // Option 4: NetAssetValueInBase currency attribute
        else if (stmt.NetAssetValueInBase?.currency) baseCurrency = stmt.NetAssetValueInBase.currency;
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

    return { cashTransactions, openPositions, equitySummary, fromDate, toDate, baseCurrency, cashReports, transfers, securitiesInfo, accountId: flexStatements.length > 0 ? flexStatements[0].accountId : undefined };
}

// Helper to determine category
function categorizeCashTransaction(type: string, description: string): { category: CashFlowCategory, isNetInvestedFlow: boolean } {
    const t = type.toLowerCase();
    const d = description.toLowerCase();

    if (t.includes('deposit') || t.includes('withdrawal') || t.includes('transfer')) {
        if (t.includes('deposit') && t.includes('withdrawal')) {
            // IBKR generic label "Deposits/Withdrawals". Need to check amount sign, but here we only categorize type.
            // We'll rely on calling code to check sign if needed, but for "isNetInvestedFlow" it IS true.
            // Distinguishing Deposit vs Withdrawal happens at amount level, but Category generic is OK or we default based on common sense?
            // Actually, usually 1 category is returned. Let's return Generic DEPOSIT/WITHDRAWAL based on logic elsewhere?
            // No, let's keep it simple: It IS a Net Invested Flow.
            // We will refine category in the loop based on amount logic if ambiguous.

            // Refinement: Check for EAE keywords to exclude from Net Invested
            if (d.includes('exercise') || d.includes('assignment') || d.includes('expiration') || d.includes('cash in lieu')) {
                return { category: 'OTHER', isNetInvestedFlow: false };
            }

            return { category: 'DEPOSIT', isNetInvestedFlow: true }; // Placeholder, verified by amount < 0 ? WITHDRAWAL in loop
        }

        // Refinement: Check for EAE keywords here too just in case 'transfer' isn't caught above but generally safe
        if (d.includes('exercise') || d.includes('assignment') || d.includes('expiration')) {
            return { category: 'OTHER', isNetInvestedFlow: false };
        }

        return { category: 'DEPOSIT', isNetInvestedFlow: true };
    }

    if (t.includes('dividend') || t.includes('withholding tax')) return { category: 'DIVIDEND', isNetInvestedFlow: false };
    if (t.includes('interest')) return { category: 'INTEREST', isNetInvestedFlow: false };
    if (t.includes('fee') || t.includes('commission')) return { category: 'FEE', isNetInvestedFlow: false };

    return { category: 'OTHER', isNetInvestedFlow: false };
}

export function normalizeConsolidatedTransfers(filesData: { transfers: Transfer[] }[]): Transfer[] {
    const allTransfers = filesData.flatMap(f => f.transfers);
    // Return ALL transfers. We do NOT want to net them out for consolidated view.
    // Each sub-account needs its own Withdrawal/Deposit record to be accurate.
    // Summing them up in the portfolio will result in 0 net change, which is correct (Internal Transfer).
    return allTransfers;
}
