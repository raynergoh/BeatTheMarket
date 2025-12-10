const yahooFinance = require('yahoo-finance2').default;

async function test() {
    console.log("Testing live fetch for SGD=X (USD -> SGD)...");
    try {
        const result = await yahooFinance.historical('SGD=X', {
            period1: new Date(Date.now() - 86400000 * 365 * 5), // 5 years ago
            period2: new Date(),
        });
        console.log("SGD=X Result:", result);
    } catch (e) {
        console.error("SGD=X Error:", e);
    }

    console.log("\nTesting live fetch for EURUSD=X (EUR -> USD)...");
    try {
        const result = await yahooFinance.historical('EURUSD=X', {
            period1: new Date(Date.now() - 86400000 * 7),
            period2: new Date(),
        });
        console.log("EURUSD=X Result:", result);
    } catch (e) {
        console.error("EURUSD=X Error:", e);
    }
}

test();
