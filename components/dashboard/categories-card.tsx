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

interface CategoriesCardProps {
    data?: {
        asset?: CategoryData[]
        sector?: CategoryData[]
        geo?: CategoryData[]
        ticker?: CategoryData[]
    }
}

export function CategoriesCard({ data }: CategoriesCardProps) {
    const [activeTab, setActiveTab] = React.useState("sector")

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
                <CardTitle className="text-base sm:text-lg">Portfolio Allocation</CardTitle>
                <CardDescription>Breakdown by {activeTab}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0 px-2 sm:px-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-4">
                        <TabsTrigger value="asset" className="text-xs sm:text-sm px-1 sm:px-3">Asset</TabsTrigger>
                        <TabsTrigger value="sector" className="text-xs sm:text-sm px-1 sm:px-3">Sector</TabsTrigger>
                        <TabsTrigger value="geo" className="text-xs sm:text-sm px-1 sm:px-3">Geo</TabsTrigger>
                        <TabsTrigger value="ticker" className="text-xs sm:text-sm px-1 sm:px-3">Ticker</TabsTrigger>
                    </TabsList>

                    <TabsContent value="asset">
                        <CategoryPieChart title="Assets" data={data.asset || []} />
                    </TabsContent>
                    <TabsContent value="sector">
                        <CategoryPieChart title="Sectors" data={data.sector || []} />
                    </TabsContent>

                    <TabsContent value="geo">
                        <CategoryPieChart title="Regions" data={data.geo || []} />
                    </TabsContent>
                    <TabsContent value="ticker">
                        <CategoryPieChart title="Tickers" data={data.ticker || []} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
