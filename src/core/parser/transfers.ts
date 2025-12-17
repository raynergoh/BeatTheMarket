
import { Transfer, CashTransaction, CashFlowCategory } from '../types';
import { CASH_FLOW_CATEGORIES, TRANSFER_TYPES, LEVEL_OF_DETAIL } from '../constants';
import { toArray, formatIbkrDate } from './xml-utils';

export function parseTransfers(statement: any): Transfer[] {
    const rawTransfers = toArray(statement.Transfers?.Transfer);
    const transfers: Transfer[] = [];

    for (const t of rawTransfers) {
        const dateStr = t.date ? t.date : (t.reportDate ? t.reportDate : ''); // reportDate fallback

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
            fxRateToBase: parseFloat(t.fxRateToBase || '1'),
            positionAmountInBase: t.positionAmountInBase
        });
    }
    return transfers;
}

/**
 * Converts Transfer objects into CashTransaction objects for unified flow analysis.
 * Transfers are usually treated as Net Invested Capital changes (Deposits/Withdrawals).
 */
export function transfersToCashTransactions(transfers: Transfer[]): CashTransaction[] {
    const transactions: CashTransaction[] = [];

    for (const t of transfers) {
        // Only merge if amount is non-zero to avoid noise
        if (t.amount !== 0) {
            const flowAmount = t.amount;
            // Trust the sign from the XML.
            // If amount is negative, it's a withdrawal/liability-in.
            // If amount is positive, it's a deposit/liability-out.

            transactions.push({
                amount: flowAmount,
                currency: t.currency,
                date: t.date, // Already formatted in parseTransfers
                description: `Transfer ${t.direction}: ${t.type}`,
                type: t.type,
                // Append AccountID to Ensure Uniqueness across portfolios for Internal Transfers
                // Internal Transfers share the same IBKR Transaction ID on both sides (Sender/Receiver).
                // We want to keep BOTH legs, so we must make the IDs distinct per account.
                transactionId: `${t.transactionID}-${t.accountId}`,
                fxRateToBase: t.fxRateToBase || 1,
                levelOfDetail: LEVEL_OF_DETAIL.DETAIL,
                accountId: t.accountId,
                acctAlias: t.acctAlias,
                category: flowAmount < 0 ? 'WITHDRAWAL' : 'DEPOSIT' as CashFlowCategory,
                isNetInvestedFlow: true // Transfers usually count as Net Invested Capital changes
            });
        }
    }
    return transactions;
}
