"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { OpenPosition } from "@/lib/ibkr-parser";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CashHoldingsProps {
    holdings: OpenPosition[];
    totalNetWorth: number; // To calculate % of portfolio if needed, or check for consistency
}

import { useCurrency } from "@/components/currency-context";

export function CashHoldings({ holdings, totalNetWorth }: CashHoldingsProps) {
    const { targetCurrency, currencySymbol } = useCurrency();

    // Filter for cash
    const cashPositions = React.useMemo(() => {
        return holdings.filter(p =>
            p.assetCategory === 'CASH' ||
            p.symbol === 'CASH' ||
            ['USD', 'SGD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'JPY', 'KRW'].includes(p.symbol)
        );
    }, [holdings]);


    // Aggregate by currency (in case of mult-account or split rows)
    const aggregatedCash = React.useMemo(() => {
        const map = new Map<string, { amount: number, value: number }>();

        cashPositions.forEach(p => {
            const curr = p.currency || p.symbol; // Fallback
            const existing = map.get(curr) || { amount: 0, value: 0 };

            map.set(curr, {
                amount: existing.amount + p.quantity,
                value: existing.value + p.value // p.value is already converted to Target by backend
            });
        });

        return Array.from(map.entries()).map(([currency, data]) => ({
            currency,
            amount: data.amount,
            value: data.value
        }));

    }, [cashPositions]);

    const totalCash = aggregatedCash.reduce((sum, item) => sum + item.value, 0);

    if (aggregatedCash.length === 0 && totalCash === 0) {
        return null; // Or return empty state
    }

    return (
        <Card className="col-span-full xl:col-span-2">
            <CardHeader className="flex flex-row items-center font-semibold pt-6">
                <div className="flex items-center gap-2">
                    <span className="text-lg">Cash Holdings</span>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <Info className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Cash balances in different currencies converted to {targetCurrency}.</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Currency</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">Amount</TableHead>
                            <TableHead className="text-right">Value ({targetCurrency})</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {aggregatedCash.map((item) => (
                            <TableRow key={item.currency}>
                                <TableCell className="font-medium flex items-center gap-2">
                                    {/* Simple flag or code */}
                                    {item.currency}
                                </TableCell>
                                <TableCell className="text-right hidden sm:table-cell">
                                    {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                    {currencySymbol}{item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-bold">
                            <TableCell>Total Cash</TableCell>
                            <TableCell className="text-right hidden sm:table-cell"></TableCell>
                            <TableCell className="text-right">
                                {currencySymbol}{totalCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
