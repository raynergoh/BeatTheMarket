import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Percent, HelpCircle } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface SummaryCardsProps {
    netWorth: number;
    totalDeposited: number;
    benchmarkValue: number;
    selectedBenchmark: string;
    onBenchmarkChange: (value: string) => void;
    mwr?: number;
    annualizedMwr?: number;
    benchmarkMwr?: number;
    annualizedBenchmarkMwr?: number;
    currencySymbol?: string;
}

export function SummaryCards({
    netWorth = 0,
    totalDeposited = 0,
    benchmarkValue = 0,
    selectedBenchmark = "spy",
    onBenchmarkChange,
    mwr = 0,
    annualizedMwr = 0,
    benchmarkMwr = 0,
    annualizedBenchmarkMwr = 0,
    currencySymbol = '$'
}: SummaryCardsProps) {
    const pl = netWorth - totalDeposited;
    const alpha = mwr - benchmarkMwr;
    const annualizedAlpha = annualizedMwr - annualizedBenchmarkMwr;

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
                    <div className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{currencySymbol}{netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-xs text-muted-foreground">
                        Total Deposited: {currencySymbol}{totalDeposited.toLocaleString()}
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">P/L</CardTitle>
                    {pl >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                </CardHeader>
                <CardContent>
                    <div className={`text-xl sm:text-2xl font-bold ${pl >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {pl >= 0 ? "+" : ""}{currencySymbol}{Math.abs(pl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 cursor-help w-fit">
                                    {mwr >= 0 ? "+" : ""}{mwr.toFixed(1)}% (MWR)
                                </p>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">
                                    Money-Weighted Return (MWR) accounts for the timing and size of cash flows, reflecting personal performance.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <p className="text-sm font-semibold mt-1 flex items-center gap-1">
                        Annualised MWR: {annualizedMwr >= 0 ? "+" : ""}{annualizedMwr.toFixed(1)}%
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-[200px] text-xs">
                                        The compounded annual growth rate (CAGR) based on your Money-Weighted Return.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Alpha</CardTitle>
                    <Percent className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className={`text-xl sm:text-2xl font-bold ${alpha >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}%
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="text-xs text-muted-foreground cursor-help w-fit border-b border-dotted border-muted-foreground/50">
                                    vs Benchmark (Total)
                                </p>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">
                                    The difference between your Total MWR and the Benchmark Total MWR.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <p className="text-sm font-semibold mt-1 flex items-center gap-1">
                        Annualised Alpha: {annualizedAlpha >= 0 ? "+" : ""}{annualizedAlpha.toFixed(1)}%
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-[200px] text-xs">
                                        The difference between your Annualised MWR and the Benchmark Annualised MWR.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Benchmark Comparison</CardTitle>
                    <Select value={selectedBenchmark} onValueChange={onBenchmarkChange}>
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                            <SelectValue placeholder="Index" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                            <SelectItem value="sp500">S&P 500</SelectItem>
                            <SelectItem value="qqq">QQQ</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{currencySymbol}{benchmarkValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-xs text-muted-foreground">
                        if invested in {selectedBenchmark === 'sp500' ? 'S&P 500' : selectedBenchmark.toUpperCase()}
                    </p>
                    <p className="text-sm font-semibold mt-1 flex items-center gap-1">
                        Annualised MWR: {annualizedBenchmarkMwr >= 0 ? "+" : ""}{annualizedBenchmarkMwr.toFixed(1)}%
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-[200px] text-xs">
                                        The compounded annual growth rate (CAGR) of the benchmark, assuming the same deposit timing as your portfolio.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
