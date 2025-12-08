
// Static mapping for major ETFs to improve Geographical breakdown
// Source: Rough estimates based on fund factsheets (as of late 2024)

export const ETF_GEO_MAP: Record<string, Record<string, number>> = {
    // S&P 500 / US Equity
    'CSPX.AS': { 'United States': 1.0 },
    'CSPX': { 'United States': 1.0 },
    'CSSPX': { 'United States': 1.0 },
    'CSSPX.AS': { 'United States': 1.0 },
    'CSSPX.SW': { 'United States': 1.0 },
    'CSSPXz': { 'United States': 1.0 },
    'VUAA': { 'United States': 1.0 },
    'VUAA.L': { 'United States': 1.0 },
    'VUAA.DE': { 'United States': 1.0 },
    'VUAA.MI': { 'United States': 1.0 },
    'VUG': { 'United States': 1.0 },
    'QQQ': { 'United States': 1.0 },
    'QQQM': { 'United States': 1.0 },
    'SPY': { 'United States': 1.0 },
    'IVV': { 'United States': 1.0 },
    'VOO': { 'United States': 1.0 },

    // All-World (VWRA / VT)
    // Approx weights: US 60-63%, Japan 6%, UK 4%, Emerging 10%, Euro 15%
    'VWRA.L': {
        'United States': 0.63,
        'Japan': 0.06,
        'United Kingdom': 0.04,
        'China': 0.03,
        'France': 0.03,
        'Canada': 0.03,
        'Switzerland': 0.02,
        'Germany': 0.02,
        'Australia': 0.02,
        'Taiwan': 0.02,
        'India': 0.02,
        'Others': 0.08
    },
    'VT': {
        'United States': 0.63,
        'Japan': 0.06,
        'United Kingdom': 0.04,
        'China': 0.03,
        'Others': 0.24
    },
    'IWDA.L': { // MSCI World (Dev only)
        'United States': 0.70,
        'Japan': 0.06,
        'United Kingdom': 0.04,
        'France': 0.03,
        'Canada': 0.03,
        'Others': 0.14
    },
    'EIMI.L': { // Emerging Markets
        'China': 0.25,
        'India': 0.18,
        'Taiwan': 0.17,
        'South Korea': 0.12,
        'Brazil': 0.05,
        'Others': 0.23
    },
    // Bonds / Commodities / Other
    'TLT': { 'United States': 1.0 },
    'GLD': { 'United States': 1.0 },
    'IAU': { 'United States': 1.0 },
    'SLV': { 'United States': 1.0 },

    // Aliases for Global/Regional
    'IWDA': { 'United States': 0.70, 'Japan': 0.06, 'United Kingdom': 0.04, 'France': 0.03, 'Canada': 0.03, 'Others': 0.14 },
    'EIMI': { 'China': 0.25, 'India': 0.18, 'Taiwan': 0.17, 'South Korea': 0.12, 'Brazil': 0.05, 'Others': 0.23 },
    'WSML.L': { 'United States': 0.60, 'Japan': 0.10, 'United Kingdom': 0.05, 'Others': 0.25 },
    'WSML': { 'United States': 0.60, 'Japan': 0.10, 'United Kingdom': 0.05, 'Others': 0.25 },
};

export const ETF_ASSET_MAP: Record<string, string> = {
    'TLT': 'FIXED INCOME',
    'GLD': 'COMMODITIES',
    'IAU': 'COMMODITIES',
    'SLV': 'COMMODITIES',
};
