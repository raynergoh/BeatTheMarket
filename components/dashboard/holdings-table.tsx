"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowUpDown, ArrowUp, ArrowDown, Info } from "lucide-react";
import * as React from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { OpenPosition } from '@/lib/ibkr-parser';

interface HoldingsTableProps {
    holdings: OpenPosition[];
    totalValue?: number;
}

export function HoldingsTable({ holdings, totalValue = 0 }: HoldingsTableProps) {
    const [sortConfig, setSortConfig] = React.useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const sortedHoldings = React.useMemo(() => {
        let sortableItems = [...holdings];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue = 0;
                let bValue = 0;

                // Extract values based on key
                if (sortConfig.key === 'pl') {
                    const aCost = a.costBasisMoney || 0;
                    const bCost = b.costBasisMoney || 0;
                    aValue = aCost > 0 ? ((a.value - aCost) / aCost) : 0;
                    bValue = bCost > 0 ? ((b.value - bCost) / bCost) : 0;
                } else if (sortConfig.key === 'allocation') {
                    aValue = totalValue > 0 ? (a.value / totalValue) : 0;
                    bValue = totalValue > 0 ? (b.value / totalValue) : 0;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [holdings, sortConfig, totalValue]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc'; // Default to desc (high to low) for numbers usually
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-50" />;
        }
        return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
    }

    return (
        <Card className="min-w-0 overflow-hidden">
            <CardHeader className="px-3 sm:px-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    Current Holdings
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="cursor-pointer focus:outline-none" aria-label="More info">
                                <Info className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-w-[300px] p-3 text-sm">
                            <p>Detailed view of all your current open positions and their performance.</p>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
                <Table className="text-xs sm:text-sm">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Symbol</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Price</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Avg Cost</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Cost Basis</TableHead>
                            <TableHead className="text-right cursor-pointer group hover:bg-muted/50 transition-colors hidden sm:table-cell" onClick={() => requestSort('pl')}>
                                <div className="flex items-center justify-end">
                                    P/L %
                                    {getSortIcon('pl')}
                                </div>
                            </TableHead>
                            <TableHead className="text-right cursor-pointer group hover:bg-muted/50 transition-colors" onClick={() => requestSort('allocation')}>
                                <div className="flex items-center justify-end">
                                    Alloc
                                    {getSortIcon('allocation')}
                                </div>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedHoldings.map((stock, index) => {
                            // Safety checks for potentially null numeric values
                            const safeValue = stock.value || 0;
                            const safeCostBasis = stock.costBasisMoney || 0;
                            const safeMarkPrice = stock.markPrice || 0;
                            const safeAvgCost = stock.costBasisPrice || 0;

                            const plPercent = safeCostBasis !== 0 ? ((safeValue - safeCostBasis) / Math.abs(safeCostBasis)) * 100 : 0;
                            const allocation = totalValue > 0 ? (safeValue / totalValue) * 100 : 0;

                            // Determine currency for formatting
                            const nativeCurrency = (stock.currency && stock.currency !== 'Base') ? stock.currency : 'USD';
                            const displayCurrency = (stock as any).displayCurrency || 'USD'; // Fallback to USD if not provided

                            return (
                                <TableRow key={`${stock.symbol}-${index}`}>
                                    <TableCell className="font-medium">{stock.symbol}</TableCell>
                                    <TableCell className="text-right hidden md:table-cell">
                                        {safeMarkPrice.toLocaleString('en-US', { style: 'currency', currency: nativeCurrency })}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground hidden md:table-cell">
                                        {safeAvgCost.toLocaleString('en-US', { style: 'currency', currency: nativeCurrency })}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {safeValue.toLocaleString('en-US', { style: 'currency', currency: displayCurrency })}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground hidden md:table-cell">
                                        {safeCostBasis.toLocaleString('en-US', { style: 'currency', currency: displayCurrency })}
                                    </TableCell>
                                    <TableCell className={`text-right hidden sm:table-cell ${plPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {plPercent >= 0 ? '+' : ''}{plPercent.toFixed(1)}%
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {allocation.toFixed(1)}%
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
