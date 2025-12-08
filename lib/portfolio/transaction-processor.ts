import { CashTransaction, EquitySummary } from "@/lib/ibkr-parser";

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
        const key = t.transactionId || `${dateStr}-${t.amount}-${t.description}`;
        uniqueCashMap.set(key, t);
    });
    const uniqueCashTransactions = Array.from(uniqueCashMap.values());

    // 2. Deduplicate Equity Summary
    const uniqueEquityMap = new Map<string, number>();
    allEquitySummary.forEach(item => {
        let dateStr = item.reportDate;
        if (dateStr.length === 8 && !dateStr.includes('-')) {
            dateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
        uniqueEquityMap.set(dateStr, item.total);
    });

    // 3. Gap Detection
    const warnings: string[] = [];
    if (uniqueEquityMap.size > 1) {
        const sortedDates = [...uniqueEquityMap.keys()].sort();
        for (let i = 0; i < sortedDates.length - 1; i++) {
            const currentDate = new Date(sortedDates[i]);
            const nextDate = new Date(sortedDates[i + 1]);
            const diffTime = Math.abs(nextDate.getTime() - currentDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 7) {
                warnings.push(`Data Gap Detected: No records between ${sortedDates[i]} and ${sortedDates[i + 1]} (${diffDays} days).`);
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
            const key = t.transactionId || `${t.date}-${t.amount}-${t.description}`;
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
            effectiveDeposits.push({
                date: firstReportDate,
                amount: missingCapital,
                originalAmount: missingCapital,
                currency: 'USD',
                description: 'Synthetic Initial Capital (Derived from NAV)',
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
