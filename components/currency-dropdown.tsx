"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "./currency-context";

export function CurrencyDropdown() {
    const { targetCurrency, setTargetCurrency } = useCurrency();

    return (
        <Select value={targetCurrency} onValueChange={(v: any) => setTargetCurrency(v)}>
            <SelectTrigger className="h-8 w-auto min-w-[3.5rem] gap-1 px-2 text-xs sm:text-sm">
                <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="SGD">SGD (S$)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="AUD">AUD (A$)</SelectItem>
            </SelectContent>
        </Select>
    );
}
