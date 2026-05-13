import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function testYahoo() {
    console.log("Testing live fetch for SGD=X (USD -> SGD) using chart()...");
    try {
        const result = await yahooFinance.chart('SGD=X', {
            period1: '2024-01-01',
            period2: '2024-12-31',
            interval: '1d'
        });
        console.log("Success! Sample data:", result.quotes.slice(0, 2));
    } catch (error: any) {
        console.error("Error:", error.message);
    }
}

testYahoo();
