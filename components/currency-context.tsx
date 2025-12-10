"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Currency = "USD" | "SGD" | "EUR" | "GBP" | "AUD";

interface CurrencyContextType {
    targetCurrency: Currency;
    setTargetCurrency: (c: Currency) => void;
    baseCurrency: string; // The detected base currency from XML
    setBaseCurrency: (c: string) => void;
    currencySymbol: string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const SYMBOLS: Record<Currency, string> = {
    USD: "$",
    SGD: "S$",
    EUR: "€",
    GBP: "£",
    AUD: "A$"
};

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [targetCurrency, setTargetCurrency] = useState<Currency>("USD");
    const [baseCurrency, setBaseCurrency] = useState<string>("USD");

    const currencySymbol = SYMBOLS[targetCurrency] || "$";

    return (
        <CurrencyContext.Provider value={{ targetCurrency, setTargetCurrency, baseCurrency, setBaseCurrency, currencySymbol }}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const context = useContext(CurrencyContext);
    if (context === undefined) {
        throw new Error("useCurrency must be used within a CurrencyProvider");
    }
    return context;
}
