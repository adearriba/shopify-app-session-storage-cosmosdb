export const ERRORS = {
    NO_CONNECTION: 'No connection string or client provided.',
    PARTITION_KEY_ID: 'PartitionKey is not ID and getPartitionKeyById was not defined.',
    PARTITION_KEY_SHOP: 'PartitionKey is not ID and getPartitionKeyByShop was not defined.',
    INVALID_CREDENTIALS: 'Invalid credentials provided.',
    DATABASE_ERROR: 'Failed to connect to database.',
    INITIALIZATION_FAILED: 'Failed to initialize storage.',
    TIMEOUT: 'Operation timed out',
} as const;

export const CONSTANTS = {
    MAX_RETRIES: 3,
    TIMEOUT_MS: 30000,
    BASE_DELAY_MS: 500,
    MAX_DELAY_MS: 5000
} as const;