import { XMLParser } from 'fast-xml-parser';

const BASE_URL = 'https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest';
const VERSION = '3';

export async function fetchFlexReport(token: string, queryId: string): Promise<string> {
    // Step 1: Request the report generation
    const requestUrl = `${BASE_URL}?t=${token}&q=${queryId}&v=${VERSION}`;
    console.log(`Requesting Flex Report from: ${requestUrl.replace(token, 'REDACTED')}`);

    const initResponse = await fetch(requestUrl);
    const initXml = await initResponse.text();

    if (!initResponse.ok) {
        throw new Error(`Failed to initiate Flex Query: ${initResponse.statusText} - ${initXml}`);
    }

    const parser = new XMLParser();
    const initData = parser.parse(initXml);

    if (initData.FlexStatementResponse?.Status !== 'Success') {
        const errorCode = initData.FlexStatementResponse?.ErrorCode || 'Unknown';
        const errorMsg = initData.FlexStatementResponse?.ErrorMessage || 'No error message provided';
        throw new Error(`Flex Query failed: ${errorCode} - ${errorMsg}`);
    }

    const refCode = initData.FlexStatementResponse.ReferenceCode;
    const retrieveUrl = initData.FlexStatementResponse.Url;

    if (!refCode || !retrieveUrl) {
        throw new Error('Invalid Flex Query response: Missing ReferenceCode or Url');
    }

    // Step 2: Retrieve the report with polling
    const reportUrl = `${retrieveUrl}?q=${refCode}&t=${token}&v=${VERSION}`;
    console.log(`Retrieving Flex Report from: ${reportUrl.replace(token, 'REDACTED').replace(refCode, 'REDACTED')}`);

    const maxRetries = 10;
    let retryDelay = 1000; // start with 1s

    for (let i = 0; i < maxRetries; i++) {
        const reportResponse = await fetch(reportUrl);
        const reportXml = await reportResponse.text();

        if (!reportResponse.ok) {
            throw new Error(`Failed to retrieve Flex Report: ${reportResponse.statusText} - ${reportXml}`);
        }

        const reportData = parser.parse(reportXml);

        // Check success status
        if (reportData.FlexStatementResponse?.Status === 'Success') {
            return reportXml;
        }

        // Check failure
        if (reportData.FlexStatementResponse?.Status === 'Fail') {
            const errorCode = reportData.FlexStatementResponse?.ErrorCode;
            const errorMsg = reportData.FlexStatementResponse?.ErrorMessage || 'Unknown error';

            // 1019 is "Statement generation in progress"
            if (errorCode == '1019' || errorMsg.includes('in progress')) {
                console.log(`Report generation in progress. Retrying in ${retryDelay}ms... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay = Math.min(retryDelay * 2, 8000); // Backoff cap at 8s
                continue;
            }

            throw new Error(`Flex Report retrieval failed: ${errorCode} - ${errorMsg}`);
        }

        // If we got XML but it's not the structure we expect (or partial?)
        if (reportData.FlexQueryResponse) {
            // Sometimes it returns the report directly?
            return reportXml;
        }

        console.warn('Unknown response structure during retrieval, retrying...', Object.keys(reportData));
        await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    throw new Error('Timed out waiting for Flex Report generation.');
}
