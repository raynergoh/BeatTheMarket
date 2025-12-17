import { CashTransaction, EquitySummary } from "@/src/core/types";

export interface ProcessedDeposits {
    date: string;
    amount: number;
    originalAmount: number;
    currency: string;
    description: string;
    type: string | undefined;
    transactionId: string | undefined;
}

export function processTransactions(
    allCashTransactions: CashTransaction[],
    allEquitySummary: EquitySummary[]
): {
    effectiveDeposits: ProcessedDeposits[];
    uniqueEquityMap: Map<string, number>;
    warnings: string[];
} {
    // 1. Deduplicate Cash Transactions
    const uniqueCashMap = new Map<string, CashTransaction>();
    allCashTransactions.forEach(t => {
        let dateStr = t.date;
        if (dateStr && dateStr.length === 8 && !dateStr.includes('-')) {
            dateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
        const acctId = t.accountId || t.acctAlias || 'Unknown';
        // Use composite key to prevent collisions between accounts sharing the same transactionId (e.g. Internal Transfers)
        const key = (t.transactionId ? `${t.transactionId}-${acctId}` : `${dateStr}-${t.amount}-${t.description}-${acctId}`);
        uniqueCashMap.set(key, t);
    });
    const uniqueCashTransactions = Array.from(uniqueCashMap.values());

    // 2. Deduplicate Equity Summary
    // 2. Aggregate Equity Summary (Multi-Account Support)
    // Structure: Map<ReportDate, Map<AccountId, Total>>
    const dateAccountMap = new Map<string, Map<string, number>>();

    allEquitySummary.forEach(item => {
        let dateStr = item.reportDate;
        if (dateStr.length === 8 && !dateStr.includes('-')) {
            dateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }

        // Account ID is crucial. Fallback if missing (should be patched in parser now)
        const accId = item.accountId || 'Unknown';

        if (!dateAccountMap.has(dateStr)) {
            dateAccountMap.set(dateStr, new Map<string, number>());
        }
        // Set value for this specific account-date combination.
        // Files are processed chronologically, so this overwrites older files for the SAME account, which is correct.
        dateAccountMap.get(dateStr)!.set(accId, item.total);
    });

    // Sum across accounts with Fill-Forward logic
    // This handles cases where one account has data for a date (e.g. T) but another account 
    // stopped reporting at T-1. We should use T-1 value for the second account instead of 0.
    const uniqueEquityMap = new Map<string, number>();

    // Sort dates chronologically
    const sortedAllDates = [...dateAccountMap.keys()].sort();

    // Keep track of the latest known value for each account
    const latestAccountValues = new Map<string, number>();

    // Track set of expected accounts (once an account appears, we expect it to exist forever?)
    // Or just strictly use whatever latest value we have seen.

    sortedAllDates.forEach(date => {
        const dailyMap = dateAccountMap.get(date);

        if (dailyMap) {
            dailyMap.forEach((val, accId) => {
                latestAccountValues.set(accId, val);
            });
        }

        let total = 0;
        latestAccountValues.forEach(val => total += val);
        uniqueEquityMap.set(date, total);
    });

    // 3. Gap Detection
    const warnings: string[] = [];
    if (uniqueEquityMap.size > 1) {
        const sortedDates = [...uniqueEquityMap.keys()].sort();

        const isWeekend = (date: Date) => {
            const day = date.getDay();
            return day === 0 || day === 6; // 0=Sun, 6=Sat
        };

        const getBusinessDays = (startDate: Date, endDate: Date) => {
            let count = 0;
            const cur = new Date(startDate);
            // Start checking from the day AFTER start date, up to the day BEFORE end date
            cur.setDate(cur.getDate() + 1);
            while (cur < endDate) {
                if (!isWeekend(cur)) {
                    count++;
                }
                cur.setDate(cur.getDate() + 1);
            }
            return count;
        };

        for (let i = 0; i < sortedDates.length - 1; i++) {
            const currentDate = new Date(sortedDates[i]);
            const nextDate = new Date(sortedDates[i + 1]);

            // Check real gap in days first
            const diffTime = Math.abs(nextDate.getTime() - currentDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 2) {
                // If physical gap > 2 days, check if it's just a weekend
                const missingBusinessDays = getBusinessDays(currentDate, nextDate);

                // Only warn if we are missing actual business days (e.g. > 0 or > 1?)
                // User said "gap > 2 days ... not a valid gap". 
                // A standard weekend gap (Fri -> Mon) has diffDays=3 (Sat, Sun missing). Business Days missing = 0.
                // A long weekend (Fri -> Tue) has diffDays=4 (Sat, Sun, Mon). Business Days missing = 1.
                // Let's set threshold to > 1 missing business day to be safe, or even > 2.
                // "Gap > 2 days ... not a valid gap" -> Fri to Mon is 3 days gap.
                // We want to suppress that.

                if (missingBusinessDays > 0) {
                    // Even 1 missing business day (e.g. a Tuesday) is suspicious for daily data.
                    // But maybe holidays? IBKR Flex doesn't run on holidays.
                    // We can't easily detect holidays without a library or hardcoded list.
                    // Let's relax it to > 2 business days to allow for some mixed holidays/weekends?
                    // Or just > 3 total days if business days > 0?

                    // Let's try: warn if missingBusinessDays > 2.
                    // This allows for a 3-day weekend (1 business day holiday) without warning.
                    // If missingBusinessDays > 2, it means at least 3 business days are missing.
                    if (missingBusinessDays > 2) {
                        warnings.push(`Data Gap Detected: No records between ${sortedDates[i]} and ${sortedDates[i + 1]} (${missingBusinessDays} missing business days).`);
                    }
                }
            }
        }
    }

    // 4. Identify Deposits
    const uniqueTransactionIds = new Set<string>();
    const effectiveDeposits = uniqueCashTransactions
        .filter(t => {
            if (t.levelOfDetail === 'SUMMARY') return false;
            const desc = t.description.toLowerCase();
            const type = t.type || '';

            // Explicitly allow Transfers (External or Internal that are valid flows)
            if ((type === 'INTERNAL' || type === 'Transfer') && t.amount !== 0) return true;

            if (desc.includes('deposit') || desc.includes('withdrawal')) return true;
            if ((type === 'Deposits/Withdrawals' || type === 'Deposits') && t.amount !== 0) return true;
            if ((desc.includes('receipt') || desc.includes('transfer')) && t.amount !== 0 && !desc.includes('internal')) return true;
            return false;
        })
        .filter(t => {
            const desc = t.description.toLowerCase();
            return !desc.includes('dividend') && !desc.includes('interest') && t.type !== 'Dividends' && t.type !== 'Broker Interest Paid';
        })
        .filter(t => {
            const acctId = t.accountId || t.acctAlias || 'Unknown';
            const key = (t.transactionId ? `${t.transactionId}-${acctId}` : `${t.date}-${t.amount}-${t.description}-${acctId}`);
            if (uniqueTransactionIds.has(key)) return false;
            uniqueTransactionIds.add(key);
            return true;
        })
        .map(t => {
            let dateStr = String(t.date || '');
            if (!dateStr.includes('-') && dateStr.length === 8) {
                dateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            }
            const usdAmount = t.amount * (t.fxRateToBase || 1);
            return {
                date: dateStr,
                amount: usdAmount,
                originalAmount: t.amount,
                currency: t.currency,
                description: t.description,
                type: t.type,
                transactionId: t.transactionId
            };
        });

    effectiveDeposits.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // 5. Implicit Initial Capital (Synthetic Deposit)
    if (uniqueEquityMap.size > 0) {
        const sortedDates = [...uniqueEquityMap.keys()].sort();
        const firstReportDate = sortedDates[0];
        const startNAV = uniqueEquityMap.get(firstReportDate) || 0;

        const existingDepositsByStart = effectiveDeposits
            .filter(d => d.date <= firstReportDate)
            .reduce((sum, d) => sum + d.amount, 0);

        if (startNAV > existingDepositsByStart + 100) {
            const missingCapital = startNAV - existingDepositsByStart;
            // Find the currency from the equity summary for this date
            const summaryItem = allEquitySummary.find(e => {
                let d = e.reportDate;
                if (d.length === 8 && !d.includes('-')) {
                    d = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
                }
                return d === firstReportDate;
            });
            const itemCurrency = summaryItem?.currency || 'USD';

            effectiveDeposits.push({
                date: firstReportDate,
                amount: missingCapital,
                originalAmount: missingCapital,
                currency: itemCurrency,
                description: `Synthetic Initial Capital (Derived from Initial NAV in ${itemCurrency})`,
                type: 'Synthetic',
                transactionId: 'SYNTH-' + firstReportDate
            });
            effectiveDeposits.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        }
    }

    // 6. Lag Detection & Adjustment
    const navDates = [...uniqueEquityMap.keys()].sort();
    for (let i = 0; i < effectiveDeposits.length; i++) {
        const deposit = effectiveDeposits[i];
        const currentNAV = uniqueEquityMap.get(deposit.date);

        if (currentNAV !== undefined) {
            const idx = navDates.indexOf(deposit.date);
            const prevDate = idx > 0 ? navDates[idx - 1] : null;
            const prevNAV = prevDate ? uniqueEquityMap.get(prevDate) : undefined;

            if (prevNAV !== undefined) {
                const navChange = currentNAV - prevNAV;
                if (navChange < deposit.amount * 0.5) {
                    const nextDate = idx < navDates.length - 1 ? navDates[idx + 1] : null;
                    const nextNAV = nextDate ? uniqueEquityMap.get(nextDate) : undefined;

                    if (nextNAV !== undefined && (nextNAV - currentNAV) > deposit.amount * 0.5 && nextDate) {
                        console.log(`Detected Deposit Lag for ${deposit.date} ($${deposit.amount}). Shifting to ${nextDate}.`);
                        deposit.date = nextDate;
                    }
                }
            }
        }
    }

    // Sort again to be safe
    effectiveDeposits.sort((a, b) => a.date.localeCompare(b.date));

    return { effectiveDeposits, uniqueEquityMap, warnings };
}
