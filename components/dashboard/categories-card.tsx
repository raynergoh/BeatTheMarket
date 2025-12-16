"use client"

import * as React from "react"

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CategoryPieChart } from "./category-pie-chart"
import { CategoryData } from "@/hooks/use-category-chart-data"
import { Info } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface CategoriesCardProps {
    data?: {
        asset?: CategoryData[]
        sector?: CategoryData[]
        geo?: CategoryData[]
        ticker?: CategoryData[]
    }
    currencySymbol?: string
}

export function CategoriesCard({ data, currencySymbol = "$" }: CategoriesCardProps) {
    const [activeTab, setActiveTab] = React.useState("sector")

    const tooltipText: Record<string, string> = {
        asset: "Breakdown of your portfolio by asset class distribution. This includes look-through exposure from ETFs (e.g. bonds held within a multi-asset ETF).",
        sector: "Breakdown of your portfolio by industry sector exposure. This includes sector allocation from ETFs (e.g. technology exposure from SPY).",
        geography: "Breakdown of your portfolio by geographic region. This includes geographic exposure from ETFs.",
        ticker: "This view includes implied holdings through ETFs (e.g. owning SPY includes NVDA)."
    };

    if (!data) return (
        <Card className="flex flex-col h-[500px]">
            <CardHeader>
                <CardTitle>Categories</CardTitle>
                <CardDescription>Loading data...</CardDescription>
            </CardHeader>
        </Card>
    );

    return (
        <Card className="flex flex-col h-full bg-card min-w-0 overflow-hidden">
            <CardHeader className="items-center pb-0 px-3 sm:px-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    Portfolio Allocation
                    {tooltipText[activeTab] && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="cursor-pointer focus:outline-none" aria-label="More info">
                                    <Info className="h-4 w-4 text-muted-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="max-w-[300px] p-3 text-sm">
                                <p>{tooltipText[activeTab]}</p>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </CardTitle>
                <CardDescription>Breakdown by {activeTab}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0 px-2 sm:px-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-4">
                        <TabsTrigger value="asset" className="text-xs sm:text-sm px-1 sm:px-3">Asset</TabsTrigger>
                        <TabsTrigger value="sector" className="text-xs sm:text-sm px-1 sm:px-3">Sector</TabsTrigger>
                        <TabsTrigger value="geography" className="text-xs sm:text-sm px-1 sm:px-3">Geography</TabsTrigger>
                        <TabsTrigger value="ticker" className="text-xs sm:text-sm px-1 sm:px-3">Ticker</TabsTrigger>
                    </TabsList>

                    <TabsContent value="asset">
                        <CategoryPieChart title="Assets" data={data.asset || []} currencySymbol={currencySymbol} />
                    </TabsContent>
                    <TabsContent value="sector">
                        <CategoryPieChart title="Sectors" data={data.sector || []} currencySymbol={currencySymbol} />
                    </TabsContent>

                    <TabsContent value="geography">
                        <CategoryPieChart title="Regions" data={data.geo || []} currencySymbol={currencySymbol} />
                    </TabsContent>
                    <TabsContent value="ticker">
                        <CategoryPieChart title="Tickers" data={data.ticker || []} currencySymbol={currencySymbol} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
