
import fs from 'fs';
import path from 'path';
import { parseFlexReport } from '../src/core/parser/index';

const mainXmlPath = path.join(process.cwd(), 'xml_test_files', 'JG-main.xml');
const optionXmlPath = path.join(process.cwd(), 'xml_test_files', 'JG-option.xml');

// Mock files if not running in full env, but here we expect them to exist
if (!fs.existsSync(mainXmlPath) || !fs.existsSync(optionXmlPath)) {
    console.error("Test files not found");
    process.exit(1);
}

const mainContent = fs.readFileSync(mainXmlPath, 'utf-8');
const optionContent = fs.readFileSync(optionXmlPath, 'utf-8');

const mainData = parseFlexReport(mainContent);
const optionData = parseFlexReport(optionContent);

// Test Cases
const testCases = [
    { id: '610989424', desc: 'AZN Put Option Transfer', expectedMainSign: 1, expectedOptionSign: -1 }, // Sender (+), Receiver (-)
    { id: '597146489', desc: 'Cash Transfer 80k', expectedMainSign: -1, expectedOptionSign: 1 },    // Sender (OUT -), Receiver (IN +)
];

console.log("--- Verifying Transfer Logic ---");

let allPassed = true;

testCases.forEach(test => {
    const mainTx = mainData.cashTransactions.find(t => t.transactionId === test.id);
    const optionTx = optionData.cashTransactions.find(t => t.transactionId === test.id);

    console.log(`\nTesting: ${test.desc} (ID: ${test.id})`);

    let passed = true;

    if (!mainTx) {
        console.error(`  [FAIL] Transaction not found in JG-main`);
        passed = false;
    } else {
        const sign = Math.sign(mainTx.amount);
        if (sign !== test.expectedMainSign) {
            console.error(`  [FAIL] JG-main Sign wrong. Expected ${test.expectedMainSign}, got ${sign} (Amount: ${mainTx.amount})`);
            passed = false;
        } else {
            console.log(`  [PASS] JG-main Amount: ${mainTx.amount} (Correct Sign)`);
        }
    }

    if (!optionTx) {
        console.error(`  [FAIL] Transaction not found in JG-option`);
        passed = false;
    } else {
        const sign = Math.sign(optionTx.amount);
        if (sign !== test.expectedOptionSign) {
            console.error(`  [FAIL] JG-option Sign wrong. Expected ${test.expectedOptionSign}, got ${sign} (Amount: ${optionTx.amount})`);
            passed = false;
        } else {
            console.log(`  [PASS] JG-option Amount: ${optionTx.amount} (Correct Sign)`);
        }
    }

    // Verify they sum to ~0
    if (mainTx && optionTx) {
        const sum = mainTx.amount + optionTx.amount;
        if (Math.abs(sum) > 0.01) {
            console.error(`  [FAIL] Sum non-zero: ${sum}`);
            passed = false;
        } else {
            console.log(`  [PASS] Offsetting sum is approx zero: ${sum}`);
        }
    }

    if (!passed) allPassed = false;
});

if (allPassed) {
    console.log("\n✅ ALL TESTS PASSED");
} else {
    console.error("\n❌ SOME TESTS FAILED");
    process.exit(1);
}
