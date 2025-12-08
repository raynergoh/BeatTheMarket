"use client"

import * as React from "react"
import { ResponsiveContainer, Tooltip, TooltipProps } from "recharts"

import { cn } from "@/lib/utils"

// Format: { theme: { light: string, dark: string } }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
    [k in string]: {
        label?: React.ReactNode
        icon?: React.ComponentType
    } & (
        | { color?: string; theme?: never }
        | { color?: never; theme: Record<keyof typeof THEMES, string> }
    )
}

type ChartContextProps = {
    config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
    const context = React.useContext(ChartContext)

    if (!context) {
        throw new Error("useChart must be used within a <ChartContainer />")
    }

    return context
}

const ChartContainer = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div"> & {
        config: ChartConfig
        children: React.ComponentProps<typeof ResponsiveContainer>["children"]
    }
>(({ id, className, children, config, ...props }, ref) => {
    const uniqueId = React.useId()
    const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

    return (
        <ChartContext.Provider value={{ config }}>
            <div
                data-chart={chartId}
                ref={ref}
                className={cn(
                    "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
                    className
                )}
                {...props}
            >
                <ChartStyle id={chartId} config={config} />
                <ResponsiveContainer>
                    {children}
                </ResponsiveContainer>
            </div>
        </ChartContext.Provider>
    )
})
ChartContainer.displayName = "ChartContainer"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
    const colorConfig = Object.entries(config).filter(
        ([_, config]) => config.theme || config.color
    )

    if (!colorConfig.length) {
        return null
    }

    return (
        <style dangerouslySetInnerHTML={{
            __html: Object.entries(THEMES).map(([theme, prefix]) => `
        ${prefix} [data-chart=${id}] {
          ${colorConfig.map(([key, itemConfig]) => {
                const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color
                return color ? `--color-${key}: ${color};` : null
            }).join("\n")}
        }
      `).join("\n")
        }} />
    )
}

const ChartTooltip = Tooltip

const ChartTooltipContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<typeof Tooltip> &
    React.ComponentProps<"div"> & {
        hideLabel?: boolean
        hideIndicator?: boolean
        indicator?: "line" | "dot" | "dashed"
        nameKey?: string
        labelKey?: string
        formatter?: (value: any, name: any, item: any, index: number) => React.ReactNode
        payload?: any[]
    }
>(({ active, payload, className, indicator = "dot", hideLabel = false, hideIndicator = false, label, labelFormatter, config, nameKey, labelKey, formatter }, ref) => {
    const { config: configContext } = useChart()

    const tooltipConfig = config || configContext

    if (!active || !payload?.length) {
        return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
        <div
            ref={ref}
            className={cn(
                "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
                className
            )}
        >
            {!nestLabel ? (
                <div className="grid gap-1.5">
                    {!hideLabel && (
                        <div className="font-medium text-foreground pb-1 mb-1 border-b border-border/50">
                            {labelFormatter ? labelFormatter(label, payload) : label}
                        </div>
                    )}
                    {payload.map((item: any, index: number) => {
                        const key = (item.dataKey || item.name || "value") as string
                        const itemConfig = tooltipConfig[key] || { label: key, color: item.fill }
                        // Prioritize config color, then item fill, then payload fill (for Pie charts)
                        const itemColor = itemConfig.color || item.fill || item.color || item.payload?.fill;
                        const label = (nameKey ? item.payload[nameKey] : null) || itemConfig.label || item.name;

                        return (
                            <div
                                key={index}
                                className="flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground"
                            >
                                {itemConfig?.icon ? (
                                    <itemConfig.icon />
                                ) : (
                                    !hideIndicator && (
                                        <div
                                            className={cn(
                                                "h-2.5 w-2.5 shrink-0 rounded-[2px]",
                                                indicator === "dot" && "rounded-full"
                                            )}
                                            style={{ backgroundColor: itemColor }}
                                        />
                                    )
                                )}
                                <div className="flex flex-1 justify-between leading-none gap-4">
                                    <div className="grid gap-1.5">
                                        <span className="text-muted-foreground">
                                            {label}
                                        </span>
                                    </div>
                                    {item.value && (
                                        <span className="font-mono font-medium tabular-nums text-foreground">
                                            {formatter
                                                ? formatter(item.value, key, item, index)
                                                : Number(item.value).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                null // Handle single item special case if needed
            )}
        </div>
    )
})
ChartTooltipContent.displayName = "ChartTooltipContent"

export {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
}
