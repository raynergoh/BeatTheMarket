"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import { SummaryCards } from "@/components/dashboard/summary-cards";
import { PerformanceChart } from "@/components/dashboard/performance-chart";

import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { ModeToggle } from "@/components/mode-toggle";
import { SettingsDialog } from "@/components/settings-dialog";
import { CashHoldings } from "@/components/dashboard/cash-holdings";
import { CategoriesCard } from "@/components/dashboard/categories-card";
import { GuideModal } from "@/components/guide-modal";
import { OpenPosition } from "@/lib/ibkr-parser";

interface ComparisonPoint {
  date: string;
  benchmarkValue: number;
  totalInvested: number;
  portfolioValue?: number;
}

interface PortfolioSummary {
  netWorth: number;
  totalDeposited: number;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonPoint[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({ netWorth: 0, totalDeposited: 0 });
  const [holdings, setHoldings] = useState<OpenPosition[]>([]);
  const [categories, setCategories] = useState<any>(undefined);

  const [debugDeposits, setDebugDeposits] = useState<any[]>([]);

  const [warnings, setWarnings] = useState<string[]>([]);

  const [selectedBenchmark, setSelectedBenchmark] = useState("sp500");

  const fetchData = async () => {
    const token = localStorage.getItem("ibkr_token");
    const queryId = localStorage.getItem("ibkr_query_id");

    const manualHistoryStr = localStorage.getItem("ibkr_manual_history");
    const manualHistory = manualHistoryStr ? JSON.parse(manualHistoryStr) : [];

    // Allow fetch if either credentials exist OR manual history exists
    if ((!token || !queryId) && manualHistory.length === 0) {
      // No credentials AND no manual history yet
      return;
    }

    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, queryId, manualHistory })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch data');
      }

      const responseData = await res.json();
      setComparisonData(responseData.comparison || []);
      setSummary(responseData.summary || { netWorth: 0, totalDeposited: 0 });
      setHoldings(responseData.holdings || []);
      setCategories(responseData.categories); // New field
      setDebugDeposits(responseData.debugDeposits || []);
      setWarnings(responseData.warnings || []);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Format comparison data for chart
  const chartData = comparisonData.map(d => ({
    date: d.date,
    portfolioValue: d.portfolioValue || 0,
    benchmarkValue: d.benchmarkValue,
    totalInvested: d.totalInvested
  }));

  // Get latest benchmark value for alpha calc
  const latestBenchmark = comparisonData.length > 0 ? comparisonData[comparisonData.length - 1].benchmarkValue : 0;

  // Calculate All-Time MWR and Annualised Return for SummaryCards
  const { mwr, annualizedMwr, benchmarkMwr, annualizedBenchmarkMwr } = (() => {
    if (comparisonData.length < 2) return { mwr: 0, annualizedMwr: 0, benchmarkMwr: 0, annualizedBenchmarkMwr: 0 };

    const start = comparisonData[0];
    const end = comparisonData[comparisonData.length - 1];

    const startValue = start.portfolioValue || 0;
    const endValue = end.portfolioValue || 0;

    // Benchmark Values
    const startBenchmark = start.benchmarkValue || 0;
    const endBenchmark = end.benchmarkValue || 0;

    const startInvested = start.totalInvested || 0;
    const endInvested = end.totalInvested || 0;
    const netFlow = endInvested - startInvested;

    // Modified Dietz
    // Denominator is the weighted capital. Since flows are identical for both, we use the same denominator.
    // (Assuming start values might differ if inception dates differ, but typically startInvested is same).
    // Actually, if we are comparing from T=0 where both are 0, value is 0.
    // If we filter range, we use the value at start of range.

    // For Portfolio:
    const denominator = startValue + (0.5 * netFlow);
    const mwrVal = denominator > 0 ? ((endValue - startValue - netFlow) / denominator) : 0;

    // For Benchmark:
    // We treat 'startBenchmark' as the starting capital allocated to benchmark strategy at T=start
    const denominatorBenchmark = startBenchmark + (0.5 * netFlow);
    const benchmarkMwrVal = denominatorBenchmark > 0 ? ((endBenchmark - startBenchmark - netFlow) / denominatorBenchmark) : 0;

    // Annualised (Portfolio only for now, can extend if needed)
    const startDate = new Date(start.date);
    const endDate = new Date(end.date);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Avoid division by zero or extreme values for very short periods
    let ann = 0;
    let annBenchmark = 0;
    if (diffDays > 30) {
      const years = diffDays / 365.25;
      ann = (Math.pow(1 + mwrVal, 1 / years) - 1);
      annBenchmark = (Math.pow(1 + benchmarkMwrVal, 1 / years) - 1);
    }

    return { mwr: mwrVal * 100, annualizedMwr: ann * 100, benchmarkMwr: benchmarkMwrVal * 100, annualizedBenchmarkMwr: annBenchmark * 100 };
  })();

  // Filter holdings for display
  const isCash = (p: OpenPosition) =>
    p.assetCategory === 'CASH' ||
    p.symbol === 'CASH' ||
    ['USD', 'SGD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'JPY', 'KRW'].includes(p.symbol);

  const equityHoldings = holdings.filter(h => !isCash(h));


  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <div className="flex items-center gap-2">
            <Image
              src="/images/app/logo-full-custom.png"
              alt="BeatTheMarket"
              width={855}
              height={125}
              className="h-8 w-auto md:h-10 dark:filter-none filter brightness-[0.4] saturate-[1.5]"
              priority
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select defaultValue="usd">
              <SelectTrigger className="h-8 w-[85px]">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">USD</SelectItem>
                <SelectItem value="sgd">SGD</SelectItem>
              </SelectContent>
            </Select>
            <ModeToggle />
            <GuideModal />
            <SettingsDialog onSettingsChanged={fetchData} />

          </div>
        </header>
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
          {error && <div className="p-4 rounded-md bg-red-100 text-red-700">{error} - Please check settings.</div>}

          {warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              {warnings.map((w, idx) => (
                <div key={idx} className="p-4 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-200 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-sm font-medium">{w}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-4 md:gap-8">
              {/* Row 1: Summary Cards (Full Width) */}
              <SummaryCards
                netWorth={summary.netWorth}
                totalDeposited={summary.totalDeposited}
                benchmarkValue={latestBenchmark}
                selectedBenchmark={selectedBenchmark}
                onBenchmarkChange={setSelectedBenchmark}
                mwr={mwr}
                annualizedMwr={annualizedMwr}
                benchmarkMwr={benchmarkMwr}
                annualizedBenchmarkMwr={annualizedBenchmarkMwr}
              />

              {/* Row 2: Performance Chart (Full Width) */}
              <PerformanceChart
                data={chartData}
                debugDeposits={debugDeposits}
                selectedBenchmark={selectedBenchmark}
              />

              {/* Row 3: Split View - 50/50 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                {/* Left Column: Holdings & Cash (50%) */}
                <div className="flex flex-col gap-4 w-full">
                  <CashHoldings holdings={holdings} totalNetWorth={summary.netWorth} />
                  <HoldingsTable holdings={equityHoldings} totalValue={summary.netWorth} />
                </div>

                {/* Right Column: Categories (50%) */}
                <div>
                  <CategoriesCard data={categories} />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
