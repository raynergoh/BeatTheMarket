
import { XMLParser } from 'fast-xml-parser';
import { ERRORS } from '../constants';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
});

export function parseXML(xmlContent: string): any {
    if (!xmlContent || typeof xmlContent !== 'string') {
        throw new Error('Invalid input: XML content must be a string');
    }

    if (!xmlContent.trim().startsWith('<')) {
        throw new Error(ERRORS.NOT_XML);
    }

    const parsed = parser.parse(xmlContent);

    // Basic Validation
    if (!parsed.FlexQueryResponse) {
        if (parsed.FlexStatementResponse) {
            throw new Error(`IBKR Error: ${parsed.FlexStatementResponse.ErrorMessage || 'Check logs'}`);
        }
        if (parsed.ActivityFlexQuery) {
            throw new Error(ERRORS.INCORRECT_FORMAT);
        }
        throw new Error(`${ERRORS.INVALID_RESPONSE} Found: ${Object.keys(parsed).join(', ')}`);
    }

    return parsed;
}

export function toArray<T>(item: T | T[]): T[] {
    if (item === undefined || item === null) return [];
    return Array.isArray(item) ? item : [item];
}

export function formatIbkrDate(dateStr: string): string {
    if (!dateStr || dateStr.length !== 8) return dateStr || '';
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}
