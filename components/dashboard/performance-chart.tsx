"use client";

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Legend, Line } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, DollarSign, TrendingDown, TrendingUp, Percent, HelpCircle } from "lucide-react"
import { PortfolioData } from "@/lib/ibkr-parser"
import { DataVerificationDialog } from "./data-verification-dialog"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

export interface PerformanceChartProps {
    data: PortfolioData[];
    debugDeposits?: any[];
    selectedBenchmark: string;
}

type TimeRange = "1M" | "YTD" | "1Y" | "5Y" | "ALL";

export function PerformanceChart({ data, debugDeposits = [], selectedBenchmark }: PerformanceChartProps) {
    const [timeRange, setTimeRange] = React.useState<TimeRange>("ALL");

    const chartConfig = {
        portfolioValue: {
            label: "Portfolio",
            color: "var(--color-portfolio)",
        },
        benchmarkValue: {
            label: "Benchmark",
            color: "var(--color-benchmark)",
        },
        totalInvested: {
            label: "Net Deposits",
            color: "var(--muted-foreground)",
        },
    } satisfies ChartConfig;

    // Filter data based on TimeRange
    const filteredData = React.useMemo(() => {
        if (!data || data.length === 0) return [];
        const endDate = new Date(data[data.length - 1].date);
        let startDate = new Date(data[0].date);

        if (timeRange === "1M") {
            startDate = new Date(endDate);
            startDate.setMonth(endDate.getMonth() - 1);
        } else if (timeRange === "YTD") {
            startDate = new Date(endDate.getFullYear(), 0, 1);
        } else if (timeRange === "1Y") {
            startDate = new Date(endDate);
            startDate.setFullYear(endDate.getFullYear() - 1);
        } else if (timeRange === "5Y") {
            startDate = new Date(endDate);
            startDate.setFullYear(endDate.getFullYear() - 5);
        }
        // "ALL" uses original start date

        return data.filter(d => new Date(d.date) >= startDate);
    }, [data, timeRange]);

    // Calculate returns for the period
    const returns = React.useMemo(() => {
        if (!filteredData || filteredData.length < 2) return { portfolio: 0, benchmark: 0 };
        const start = filteredData[0];
        const end = filteredData[filteredData.length - 1];

        // Simple return for the displayed period
        // (End Value - Net Flows) / Start Value - 1
        // Simplified Modified Dietz for the period is better but for quick display:
        // Let's stick to the MWR logic if possible, or simple return if MWR is too heavy.
        // Given we have MWR on the cards, simple return for the chart period title is okay?
        // Actually, the user sees "Performance History +X%". 
        // Let's use simple return: (EndValue - StartValue - (EndInvested - StartInvested)) / (StartValue + (EndInvested - StartInvested)/2)
        // Standard Modified Dietz approximation for the period.

        const startValue = start.portfolioValue;
        const endValue = end.portfolioValue;
        const netFlow = end.totalInvested - start.totalInvested;
        const weightedCapital = startValue + (0.5 * netFlow);
        const portfolioReturn = weightedCapital > 0 ? ((endValue - startValue - netFlow) / weightedCapital) * 100 : 0;

        const startBench = start.benchmarkValue;
        const endBench = end.benchmarkValue;
        const weightedCapitalBench = startBench + (0.5 * netFlow);
        const benchmarkReturn = weightedCapitalBench > 0 ? ((endBench - startBench - netFlow) / weightedCapitalBench) * 100 : 0;

        return { portfolio: portfolioReturn, benchmark: benchmarkReturn };
    }, [filteredData]);

    const formatXAxis = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); // e.g. "Jan 2024"
        // If range is short, maybe show day?
        // For now, month/year is clean.
    };

    // Filter ticks to avoid clutter
    const customTicks = React.useMemo(() => {
        if (!filteredData.length) return [];
        // Aim for about 5-6 ticks
        const step = Math.ceil(filteredData.length / 6);
        return filteredData.filter((_, i) => i % step === 0).map(d => d.date);
    }, [filteredData]);

    return (
        <Card className="col-span-4">
            <CardHeader>
                <div className="flex flex-row items-start justify-between lg:items-center">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex flex-col gap-1">
                            <CardTitle>Performance History</CardTitle>
                            <CardDescription>
                                Comparing portfolio cost basis against {selectedBenchmark === 'sp500' ? 'S&P 500' : selectedBenchmark.toUpperCase()}
                            </CardDescription>
                        </div>
                        <div className="hidden lg:flex items-center gap-8">
                            <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">Portfolio</span>
                                <span className={`text-lg font-bold ${returns.portfolio >= 0 ? "text-green-500" : "text-red-500"}`}>
                                    {returns.portfolio >= 0 ? "+" : ""}{returns.portfolio.toFixed(2)}%
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">{selectedBenchmark === 'sp500' ? 'S&P 500' : selectedBenchmark.toUpperCase()}</span>
                                <span className={`text-lg font-bold ${returns.benchmark >= 0 ? "text-green-500" : "text-red-500"}`}>
                                    {returns.benchmark >= 0 ? "+" : ""}{returns.benchmark.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="hidden lg:flex bg-muted rounded-md p-1 gap-1">
                            {(["1M", "YTD", "1Y", "5Y", "ALL"] as TimeRange[]).map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${timeRange === range
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:bg-background/50"
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>

                        <DataVerificationDialog data={data} deposits={debugDeposits} />
                    </div>
                </div>
                {/* Mobile metrics view */}
                <div className="flex items-center justify-between w-full lg:hidden mt-4 border-t pt-4">
                    <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Portfolio</span>
                        <span className={`text-lg font-bold ${returns.portfolio >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {returns.portfolio >= 0 ? "+" : ""}{returns.portfolio.toFixed(2)}%
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">{selectedBenchmark === 'sp500' ? 'S&P 500' : selectedBenchmark.toUpperCase()}</span>
                        <span className={`text-lg font-bold ${returns.benchmark >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {returns.benchmark >= 0 ? "+" : ""}{returns.benchmark.toFixed(2)}%
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[400px] w-full">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                        <AreaChart data={filteredData}>
                            <defs>
                                <linearGradient id="fillPortfolio" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-portfolioValue)" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="var(--color-portfolioValue)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="fillBenchmark" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-benchmarkValue)" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="var(--color-benchmarkValue)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={formatXAxis}
                                minTickGap={30}
                                ticks={customTicks}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${value}`}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={
                                    <ChartTooltipContent
                                        indicator="dot"
                                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                                        formatter={(value) => `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    />
                                }
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="portfolioValue"
                                stroke="var(--color-portfolioValue)"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#fillPortfolio)"
                                name="Portfolio Value"
                                activeDot={{ r: 6 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="benchmarkValue"
                                stroke="var(--color-benchmarkValue)"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#fillBenchmark)"
                                name="Benchmark Value"
                            />
                            <Line
                                type="monotone"
                                dataKey="totalInvested"
                                stroke="var(--color-totalInvested)"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                name="Net Deposits"
                                dot={false}
                            />
                        </AreaChart>
                    </ChartContainer>
                </div>

                {/* Mobile Time Range Selector (Bottom) */}
                <div className="flex lg:hidden justify-center mt-4">
                    <div className="flex bg-muted rounded-md p-1 gap-1 w-full justify-between">
                        {(["1M", "YTD", "1Y", "5Y", "ALL"] as TimeRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`flex-1 px-3 py-2 text-xs font-medium rounded-sm transition-colors ${timeRange === range
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:bg-background/50"
                                    }`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
