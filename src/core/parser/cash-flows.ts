
import { CashTransaction, CashFlowCategory } from '../types';
import { CASH_FLOW_CATEGORIES } from '../constants';
import { toArray, formatIbkrDate } from './xml-utils';

export function parseCashTransactions(statement: any): CashTransaction[] {
    const rawTransactions = toArray(statement.CashTransactions?.CashTransaction);
    const transactions: CashTransaction[] = [];

    for (const ct of rawTransactions) {
        const dateStr = ct.dateTime ? ct.dateTime.split(/[\s;]/)[0] : '';
        const amount = parseFloat(ct.amount);

        // Auto-Categorize
        let { category, isNetInvestedFlow } = categorizeCashTransaction(ct.type || '', ct.description || '');

        if (category === CASH_FLOW_CATEGORIES.DEPOSIT && amount < 0) {
            category = CASH_FLOW_CATEGORIES.WITHDRAWAL as CashFlowCategory;
        }

        transactions.push({
            amount: amount,
            currency: ct.currency,
            date: formatIbkrDate(dateStr),
            description: ct.description,
            type: ct.type,
            // Append AccountID to Ensure Uniqueness across portfolios
            transactionId: `${ct.transactionID}-${ct.accountId || statement.accountId}`,
            fxRateToBase: parseFloat(ct.fxRateToBase || '1'),
            levelOfDetail: ct.levelOfDetail,
            accountId: ct.accountId || statement.accountId,
            acctAlias: ct.acctAlias || statement.acctAlias,
            category,
            isNetInvestedFlow
        });
    }

    return transactions;
}

export function categorizeCashTransaction(type: string, description: string): { category: CashFlowCategory, isNetInvestedFlow: boolean } {
    const t = type.toLowerCase();
    const d = description.toLowerCase();

    if (t.includes('deposit') || t.includes('withdrawal') || t.includes('transfer')) {
        if (t.includes('deposit') && t.includes('withdrawal')) {
            // Check for EAE keywords to exclude from Net Invested
            if (d.includes('exercise') || d.includes('assignment') || d.includes('expiration') || d.includes('cash in lieu')) {
                return { category: 'OTHER', isNetInvestedFlow: false };
            }
            return { category: 'DEPOSIT', isNetInvestedFlow: true };
        }

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
