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
        <Card className="flex flex-col h-full bg-card">
            <CardHeader className="items-center pb-0">
                <CardTitle>Portfolio Allocation</CardTitle>
                <CardDescription>Breakdown by {activeTab}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-4">
                        <TabsTrigger value="asset">Asset</TabsTrigger>
                        <TabsTrigger value="sector">Sector</TabsTrigger>
                        <TabsTrigger value="geo">Geo</TabsTrigger>
                        <TabsTrigger value="ticker">Ticker</TabsTrigger>
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
