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

import { Asset, OpenPosition } from '@/src/core/types';

interface HoldingsTableProps {
    holdings: (OpenPosition | Asset)[]; // Allow both for transition, or stricter Asset[]
    totalValue?: number;
}

export function HoldingsTable({ holdings, totalValue = 0 }: HoldingsTableProps) {
    const [sortConfig, setSortConfig] = React.useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const sortedHoldings = React.useMemo(() => {
        let sortableItems = [...holdings];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = (a as any).marketValue ?? (a as any).value ?? 0;
                const bVal = (b as any).marketValue ?? (b as any).value ?? 0;
                const aCost = (a as any).costBasis ?? (a as any).costBasisMoney ?? 0;
                const bCost = (b as any).costBasis ?? (b as any).costBasisMoney ?? 0;

                let aMetric = 0;
                let bMetric = 0;

                // Extract values based on key
                if (sortConfig.key === 'pl') {
                    aMetric = aCost > 0 ? ((aVal - aCost) / aCost) : 0;
                    bMetric = bCost > 0 ? ((bVal - bCost) / bCost) : 0;
                } else if (sortConfig.key === 'allocation') {
                    aMetric = totalValue > 0 ? (aVal / totalValue) : 0;
                    bMetric = totalValue > 0 ? (bVal / totalValue) : 0;
                }

                if (aMetric < bMetric) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aMetric > bMetric) {
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
                            const safeValue = (stock as any).marketValue ?? (stock as any).value ?? 0;
                            const safeCostBasis = (stock as any).costBasis ?? (stock as any).costBasisMoney ?? 0;
                            const safeMarkPrice = (stock as any).markPrice || 0;
                            const safeAvgCost = (stock as any).costBasisPrice || 0;

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
