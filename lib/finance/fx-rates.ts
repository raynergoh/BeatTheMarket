import { getHistoricalPrices } from '@/lib/yahoo-finance';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'debug_log.txt');

function logToFile(message: string) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}][FX] ${message}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (err) { }
}

interface FxRate {
    date: string; // YYYY-MM-DD
    rate: number;
}

const fxCache = new Map<string, FxRate[]>();

// ... (helpers) ...

export async function getHistoricalFxRates(base: string, target: string, startDate: Date, endDate: Date): Promise<FxRate[]> {
    if (base === target) return [];

    const ticker = `${base}${target}=X`;
    const cacheKey = `${ticker}-${startDate.toISOString()}-${endDate.toISOString()}`;

    if (fxCache.has(cacheKey)) {
        logToFile(`Cache hit for ${cacheKey}`);
        return fxCache.get(cacheKey)!;
    }

    try {
        logToFile(`Fetching ${ticker} from ${startDate.toISOString()} to ${endDate.toISOString()} via getHistoricalPrices`);

        // Use existing utility which handles instantiation correctly
        const result = await getHistoricalPrices(ticker, startDate, endDate);

        logToFile(`${ticker} returned ${result ? result.length : 0} rows.`);

        if (!result || result.length === 0) {
            logToFile(`WARNING: Result is empty for ${ticker}`);
            return [];
        }

        const rates: FxRate[] = result.map((day: any) => ({
            date: day.date,
            rate: day.close
        }));

        fxCache.set(cacheKey, rates);
        return rates;

    } catch (e: any) {
        logToFile(`Failed to fetch FX ${ticker}: ${e.message}`);
        return [];
    }
}
