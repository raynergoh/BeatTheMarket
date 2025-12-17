
/**
 * Currency Engine
 * Logic for FX Rate lookups and normalization.
 */

// Helper to find rate with lookback
export function getRateWithLookback(map: Map<string, number>, dateStr: string, days = 5): number {
    if (map.has(dateStr)) return map.get(dateStr)!;

    // Try looking back
    const d = new Date(dateStr);
    for (let i = 0; i < days; i++) {
        d.setDate(d.getDate() - 1);
        const s = d.toISOString().split('T')[0];
        if (map.has(s)) {
            return map.get(s)!;
        }
    }
    return 1; // Fallback
}
