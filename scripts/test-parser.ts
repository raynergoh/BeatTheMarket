
import fs from 'fs';
import path from 'path';
import { parseIBKRXml } from '../lib/ibkr-parser';

const xmlPath = path.join(process.cwd(), 'xml_test_files', 'JG-main.xml');

try {
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
    const result = parseIBKRXml(xmlContent);



    console.log('\n--- Cash Transactions (First 5) ---');
    result.cashTransactions.slice(0, 5).forEach(ct => {
        console.log(`[${ct.category}] ${ct.isNetInvestedFlow ? '(Net Invested)' : ''} Amount: ${ct.amount} ${ct.currency} - ${ct.description}`);
    });

    const transfers = result.cashTransactions.filter(ct => ct.description.includes('Transfer'));
    console.log(`\n--- Merged Transfers (${transfers.length}) ---`);
    transfers.forEach(t => {
        console.log(`[${t.category}] ${t.amount} ${t.currency} - ${t.description}`);
    });

} catch (error) {
    console.error('Error running test:', error);
}
