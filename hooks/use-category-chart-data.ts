import { ChartConfig } from "@/components/ui/chart"

export interface CategoryData {
    name: string
    value: number
    fill?: string
}

const COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
    "var(--chart-7)",
    "var(--chart-8)",
    "var(--chart-9)",
    "var(--chart-10)",
]

export function useCategoryChartData(items: CategoryData[] = []) {
    const total = items.reduce((sum, item) => sum + item.value, 0)

    // Filter out very small items (< 0.1%) or group them
    let processedData = items.filter(i => (i.value / total) > 0.001).map(i => ({ ...i }));
    const others = items.filter(i => (i.value / total) <= 0.001)

    if (others.length > 0) {
        const otherValue = others.reduce((sum, item) => sum + item.value, 0)
        const existingOthersIndex = processedData.findIndex(i => i.name === "Others")

        if (existingOthersIndex >= 0) {
            // Update the copy
            processedData[existingOthersIndex].value += otherValue
        } else {
            processedData.push({ name: "Others", value: otherValue })
        }
    }

    // Sort descending
    processedData.sort((a, b) => b.value - a.value);

    // Limit to 15 for colors (colors loop if more)
    const displayData = processedData.map((item, index) => ({
        ...item,
        fill: COLORS[index % COLORS.length]
    }))

    // Config
    const config: ChartConfig = {}
    displayData.forEach((item, index) => {
        // Create a safe key
        const key = item.name.replace(/\s+/g, '')
        config[key] = {
            label: item.name,
            color: COLORS[index % COLORS.length]
        }
    })

    return { displayData, config, total }
}
