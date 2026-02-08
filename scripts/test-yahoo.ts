const yahooFinance = require('yahoo-finance2').default;

async function testYahoo() {
    console.log("Testing live fetch for SGD=X (USD -> SGD)...");
    try {
        const result = await yahooFinance.historical('SGD=X', {
            period1: '2024-01-01',
            period2: '2024-12-31'
        });
        console.log("Success! Sample data:", result.slice(0, 2));
    } catch (error: any) {
        console.error("Error:", error.message);
    }

    console.log("\nTesting live fetch for EURUSD=X (EUR -> USD)...");
    try {
        const result = await yahooFinance.historical('EURUSD=X', {
            period1: new Date(Date.now() - 86400000 * 7),
            period2: new Date(),
        });
        console.log("EURUSD=X Result:", result);
    } catch (e: any) {
        console.error("EURUSD=X Error:", e);
    }
}

testYahoo();
