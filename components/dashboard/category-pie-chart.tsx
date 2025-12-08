"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart"

import { CategoryData, useCategoryChartData } from "@/hooks/use-category-chart-data"

interface CategoryPieChartProps {
    title: string
    data: CategoryData[]
}

export function CategoryPieChart({ title, data }: CategoryPieChartProps) {
    const { displayData, config, total } = useCategoryChartData(data)

    return (
        <div className="flex flex-col items-center justify-center gap-6">
            <ChartContainer config={config} className="mx-auto aspect-square max-h-[350px] w-full">
                <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Pie
                        data={displayData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={70}
                        outerRadius={120}
                        strokeWidth={5}
                    >
                        <Label
                            content={({ viewBox }) => {
                                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                    return (
                                        <text
                                            x={viewBox.cx}
                                            y={viewBox.cy}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                        >
                                            <tspan
                                                x={viewBox.cx}
                                                y={viewBox.cy}
                                                className="fill-foreground text-3xl font-bold"
                                            >
                                                ${(total / 1000).toFixed(0)}k
                                            </tspan>
                                            <tspan
                                                x={viewBox.cx}
                                                y={(viewBox.cy || 0) + 28}
                                                className="fill-muted-foreground text-sm"
                                            >
                                                Total {title}
                                            </tspan>
                                        </text>
                                    )
                                }
                            }}
                        />
                    </Pie>
                </PieChart>
            </ChartContainer>

            <div className="grid grid-cols-2 gap-x-4 md:gap-x-8 gap-y-2 w-full px-4">
                {displayData.map((item, index) => {
                    const percent = ((item.value / total) * 100).toFixed(1);
                    return (
                        <div key={item.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <div
                                    className="h-3 w-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: item.fill }}
                                />
                                <span className="font-medium text-foreground">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <span>{percent}%</span>
                                <span className="font-mono w-[70px] text-right">
                                    ${item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
