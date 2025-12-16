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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-1 sm:gap-4 lg:grid-cols-4 w-full min-w-0 overflow-x-hidden">
            <Card className="py-2 sm:py-6 gap-1 sm:gap-6 min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-2 sm:px-6">
                    <CardTitle className="text-xs sm:text-sm font-medium truncate">Portfolio Value</CardTitle>
                    <div className="flex items-center space-x-2 shrink-0">
                        <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                    </div>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                    <div className="text-sm sm:text-2xl font-bold truncate">{currencySymbol}{netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        Deposited: {currencySymbol}{totalDeposited.toLocaleString()}
                    </p>
                </CardContent>
            </Card>
            <Card className="py-2 sm:py-6 gap-1 sm:gap-6 min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-2 sm:px-6">
                    <CardTitle className="text-xs sm:text-sm font-medium truncate">P/L</CardTitle>
                    {pl >= 0 ? (
                        <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 shrink-0" />
                    ) : (
                        <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-red-500 shrink-0" />
                    )}
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                    <div className={`text-sm sm:text-2xl font-bold truncate ${pl >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {pl >= 0 ? "+" : ""}{currencySymbol}{Math.abs(pl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="cursor-help focus:outline-none text-left" aria-label="More info">
                                <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 w-fit border-b border-dotted border-muted-foreground/50 max-w-full truncate">
                                    {mwr >= 0 ? "+" : ""}{mwr.toFixed(1)}% (MWR)
                                </p>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-w-[200px] text-xs p-3">
                            <p>
                                Money-Weighted Return (MWR) accounts for the timing and size of cash flows, reflecting personal performance.
                            </p>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <p className="text-[10px] sm:text-sm font-semibold mt-1 flex items-center gap-1 max-w-full truncate">
                        <span className="truncate"><span className="hidden xs:inline sm:hidden lg:inline xl:hidden">Ann.</span><span className="xs:hidden sm:inline lg:hidden xl:inline">Annualised</span> MWR: {annualizedMwr >= 0 ? "+" : ""}{annualizedMwr.toFixed(1)}%</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="cursor-pointer focus:outline-none" aria-label="More info">
                                    <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-w-[200px] text-xs p-3">
                                <p>
                                    The compounded annual growth rate (CAGR) based on your Money-Weighted Return.
                                </p>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </p>
                </CardContent>
            </Card>
            <Card className="py-2 sm:py-6 gap-1 sm:gap-6 min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-2 sm:px-6">
                    <CardTitle className="text-xs sm:text-sm font-medium truncate">Alpha</CardTitle>
                    <Percent className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                    <div className={`text-sm sm:text-2xl font-bold truncate ${alpha >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}%
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="cursor-help focus:outline-none text-left" aria-label="More info">
                                <p className="text-[10px] sm:text-xs text-muted-foreground w-fit border-b border-dotted border-muted-foreground/50 max-w-full truncate">
                                    vs Benchmark (Total)
                                </p>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-w-[200px] text-xs p-3">
                            <p>
                                The difference between your Total MWR and the Benchmark Total MWR.
                            </p>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <p className="text-[10px] sm:text-sm font-semibold mt-1 flex items-center gap-1 max-w-full truncate">
                        <span className="truncate"><span className="hidden xs:inline sm:hidden lg:inline xl:hidden">Ann.</span><span className="xs:hidden sm:inline lg:hidden xl:inline">Annualised</span> Alpha: {annualizedAlpha >= 0 ? "+" : ""}{annualizedAlpha.toFixed(1)}%</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="cursor-pointer focus:outline-none" aria-label="More info">
                                    <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-w-[200px] text-xs p-3">
                                <p>
                                    The difference between your Annualised MWR and the Benchmark Annualised MWR.
                                </p>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </p>
                </CardContent>
            </Card>
            <Card className="py-2 sm:py-6 gap-1 sm:gap-6 min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 px-2 sm:px-6 min-w-0">
                    <CardTitle className="text-xs sm:text-sm font-medium truncate min-w-0">Benchmark</CardTitle>
                    <div className="min-w-0 shrink-0">
                        <Select value={selectedBenchmark} onValueChange={onBenchmarkChange}>
                            <SelectTrigger size="xs" className="h-5 md:h-[22px] xl:h-6 w-[80px] sm:w-[110px] lg:w-[95px] xl:w-[110px] text-[10px] sm:text-xs px-1 py-0 min-w-0">
                                <SelectValue placeholder="Index" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                <SelectItem value="sp500">S&P 500</SelectItem>
                                <SelectItem value="qqq">QQQ</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                    <div className="text-sm sm:text-2xl font-bold truncate" title={`${currencySymbol}${benchmarkValue.toLocaleString()}`}>{currencySymbol}{benchmarkValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        if invested in {selectedBenchmark === 'sp500' ? 'S&P 500' : selectedBenchmark.toUpperCase()}
                    </p>
                    <p className="text-[10px] sm:text-sm font-semibold mt-1 flex items-center gap-1 max-w-full truncate">
                        <span className="truncate"><span className="hidden xs:inline sm:hidden lg:inline xl:hidden">Ann.</span><span className="xs:hidden sm:inline lg:hidden xl:inline">Annualised</span> MWR: {annualizedBenchmarkMwr >= 0 ? "+" : ""}{annualizedBenchmarkMwr.toFixed(1)}%</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="cursor-pointer focus:outline-none" aria-label="More info">
                                    <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-w-[200px] text-xs p-3">
                                <p>
                                    The compounded annual growth rate (CAGR) of the benchmark, assuming the same deposit timing as your portfolio.
                                </p>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
