export const ASSET_CATEGORIES = {
    CASH: 'CASH',
    STOCK: 'STK',
    OPTION: 'OPT',
    FUTURE: 'FUT',
    RECEIVABLE: 'RECEIVABLE'
};

export const CASH_FLOW_CATEGORIES = {
    DEPOSIT: 'DEPOSIT',
    WITHDRAWAL: 'WITHDRAWAL',
    DIVIDEND: 'DIVIDEND',
    INTEREST: 'INTEREST',
    FEE: 'FEE',
    OTHER: 'OTHER'
};

export const TRANSFER_TYPES = {
    INTERNAL: 'INTERNAL'
};

export const LEVEL_OF_DETAIL = {
    SUMMARY: 'SUMMARY',
    DETAIL: 'DETAIL'
};

export const ASSET_CLASS_MULTIPLIERS = {
    DEFAULT: 1,
    OPTION_DEFAULT: 100
};

// Error Messages
export const ERRORS = {
    NOT_XML: 'Received data is not XML. Please ensure your Flex Query format is set to "XML" in IBKR Settings.',
    INCORRECT_FORMAT: 'Incorrect XML Format. You uploaded the Query Definition, not the Report.',
    INVALID_RESPONSE: 'Invalid IBKR XML. Expected FlexQueryResponse.'
};

// Regex
export const REGEX = {
    CURRENCY_CODE: /^[A-Z]{3}$/
};
