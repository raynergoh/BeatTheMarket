/**
 * Core Types for BeatTheMarket
 * Unified definitions for all domain entities.
 */

// --- Enums & Literals ---

export type CashFlowCategory = 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | 'INTEREST' | 'FEE' | 'OTHER';

export type AssetCategory = 'STK' | 'CASH' | 'OPT' | 'RECEIVABLE' | 'IOPT' | 'FUT' | 'CFD' | string;

export type TransactionType = 'INTERNAL' | 'Trade' | 'Transfer' | string;

// --- Entity Interfaces ---

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
    // Enriched Fields
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
    // Helper used in parsing logic, optional
    positionAmountInBase?: string | number;
}

export interface SecurityInfo {
    symbol: string;
    currency: string;
    assetCategory: AssetCategory;
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
    assetCategory?: AssetCategory;
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

// --- Engine / Calculation Types ---

export interface Deposit {
    date: string; // YYYY-MM-DD
    amount: number;
    currency?: string;
    originalAmount?: number;
    originalCurrency?: string;
    description?: string;
    type?: string;
    transactionId?: string;
}

export interface BenchmarkPrice {
    date: string; // YYYY-MM-DD
    close: number;
}

export interface ComparisonPoint {
    date: string;
    benchmarkValue: number;
    totalInvested: number;
    portfolioValue?: number;
}

export interface EnhancedSymbolData {
    symbol: string;
    shortName: string;
    longName: string;
    sector: string;
    industry: string;
    marketCap?: number;
    beta?: number;
    trailingPE?: number;
    dividendYield?: number;
    topHoldings?: any[]; // For ETFs
}

// --- Parsing Output ---

export interface ParsedFlexReport {
    cashTransactions: CashTransaction[];
    openPositions: OpenPosition[];
    equitySummary: EquitySummary[];
    fromDate: string;
    toDate: string;
    baseCurrency: string;
    cashReports: CashReport[];
    transfers: Transfer[];
    securitiesInfo: SecurityInfo[];
    accountId?: string;
}

// --- Generic Architecture Interfaces (New Refactor) ---

export interface Asset {
    symbol: string;
    description?: string;
    assetClass: string; // 'STOCK', 'OPTION', 'CASH', 'BOND'
    quantity: number;
    marketValue: number;
    currency: string;
    originalCurrency?: string; // New field for breakdown
    costBasis?: number;
    // Original per-share prices (before FX conversion)
    originalMarkPrice?: number;
    originalCostBasisPrice?: number;
    // Methods or computed properties for engine consumption
    getCollateralValue(baseCurrency: string, fxRates: Map<string, number>): number;
}

export interface UnifiedPortfolio {
    assets: Asset[];
    cashBalance: number;
    baseCurrency: string;
    transactions: CashTransaction[]; // Re-use existing for now or genericize later
    // New Fields for Analysis
    equityHistory: Array<{ date: string; nav: number }>;
    cashFlows: Array<{
        date: string;
        amount: number;
        type: 'DEPOSIT' | 'WITHDRAWAL';
        currency: string;
        id?: string;
        description?: string;
        originalAmount?: number;
        originalCurrency?: string;
    }>;
    metadata: {
        provider: string; // 'IBKR', 'SCHWAB'
        asOfDate: string;
        accountId?: string;
    };
}

export interface PortfolioProvider {
    name: string;
    parse(input: string): UnifiedPortfolio;
}
