import fs from 'fs';
import path from 'path';
import { IbkrProvider } from '../src/core/parser/ibkr-provider';

// Mock XML content for testing purposes
const mockXml = `
<FlexQueryResponse>
<FlexStatements>
<FlexStatement accountId="U12345" fromDate="20230101" toDate="20230131" currency="USD">
    <SecuritiesInfo>
        <SecurityInfo symbol="AAPL" currency="USD" assetCategory="STK" multiplier="1" description="Apple Inc" />
    </SecuritiesInfo>
    <OpenPositions>
        <OpenPosition symbol="AAPL" position="10" markPrice="150" costBasis="140" currency="USD" />
    </OpenPositions>
    <EquitySummaryInBase>
        <EquitySummaryByReportDateInBase reportDate="20230131" cash="5000" total="20000" />
    </EquitySummaryInBase>
    <CashReport>
        <CashReportCurrency currencyCode="USD" totalCash="100.50" settledCash="100.50" />
        <CashReportCurrency currencyCode="SGD" totalCash="500.00" settledCash="500.00" />
        <CashReportCurrency currencyCode="BASE_SUMMARY" totalCash="600.50" />
    </CashReport>
</FlexStatement>
</FlexStatements>
</FlexQueryResponse>
`;

// Use the mock XML instead of reading from a file for this test
// const xmlPath = path.join(process.cwd(), 'xml_test_files', 'JG-main.xml');

try {
    // const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
    const xmlContent = mockXml; // Use mock XML for this test

    console.log("--- Testing New Architecture: IbkrProvider ---");
    const provider = new IbkrProvider();
    const portfolio = provider.parse(xmlContent);

    console.log(`Provider: ${portfolio.metadata.provider}`);
    console.log(`Cash Balance: ${portfolio.cashBalance} ${portfolio.baseCurrency}`);
    console.log(`Assets Parsed: ${portfolio.assets.length}`);
    console.log(`Cash Assets found: ${portfolio.assets.filter(a => a.assetClass === 'CASH').length}`);
    portfolio.assets.filter(a => a.assetClass === 'CASH').forEach(a => console.log(`CASH: ${a.symbol} ${a.marketValue} (${a.originalCurrency})`));

    console.log('\n--- Assets (First 5) ---');
    portfolio.assets.slice(0, 5).forEach(a => {
        console.log(`[${a.assetClass}] ${a.symbol}: ${a.quantity} @ ${a.currency} (Market Val: ${a.marketValue})`);
    });

} catch (error) {
    console.error('Error running test:', error);
}
