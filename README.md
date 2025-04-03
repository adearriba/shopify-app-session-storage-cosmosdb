# Shopify App Session Storage - Azure Cosmos DB

Store Shopify app sessions in Azure Cosmos DB with support for multiple initialization methods, custom partition keys, and robust error handling.

## Features

- Multiple initialization methods (credentials, connection string, existing client)
- Configurable container settings
- Custom partition key strategies
- Automatic retries with exponential backoff
- Bulk operation support

## Installation

```bash
npm install @shopify/shopify-app-session-storage-cosmosdb
```

## Usage

### Basic Usage

```typescript
import { CosmosDBSessionStorage } from '@shopify/shopify-app-session-storage-cosmosdb';

// Using credentials
const storage = CosmosDBSessionStorage.withCredentials(
    "https://your-account.documents.azure.com",
    "your-key",
    "your-database"
);

// Using connection string
const storage = CosmosDBSessionStorage.withConnectionString(
    "AccountEndpoint=...;AccountKey=...",
    "your-database"
);

// Using existing client
const client = new CosmosClient({...});
const storage = CosmosDBSessionStorage.withClient(client, "your-database");
```

### Advanced Configuration

```typescript
const storage = CosmosDBSessionStorage.withCredentials(
    "your-endpoint",
    "your-key",
    "your-database",
    {
        containerName: "custom_sessions",
        containerRequest: {
            partitionKey: "/shop",
            uniqueKeyPolicy: {
                uniqueKeys: [
                    { paths: ["/id"] }
                ]
            }
        },
        // Custom partition key resolvers
        getPartitionKeyById: (id) => id.split('_')[0],
        getPartitionKeyByShop: (shop) => shop
    }
);
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `containerName` | `string` | `"shopify_sessions"` | Name of the Cosmos DB container |
| `containerRequest` | `ContainerRequest` | `{ partitionKey: "/id" }` | Container creation options |
| `getPartitionKeyById` | `(id: string) => string` | `undefined` | Custom partition key resolver for IDs |
| `getPartitionKeyByShop` | `(shop: string) => string` | `undefined` | Custom partition key resolver for shops |

## Performance Tips

1. **Bulk Operations**
   ```typescript
   // Deleting multiple sessions in bulk efficiently
   await storage.deleteSessions(['session1', 'session2', 'session3']);
   ```

2. **Connection Reuse**
   ```typescript
   // Reuse client 
   const client = new CosmosClient({...});
   const storage1 = CosmosDBSessionStorage.withClient(client, "db1");
   const storage2 = CosmosDBSessionStorage.withClient(client, "db2");
   ```

## Error Handling

The storage implements robust error handling with:
- Automatic retries with exponential backoff
- Timeout handling
- Detailed error messages
- Proper error typing

## License

MIT License - see LICENSE for more details.

## References

- [Azure Cosmos DB Documentation](https://docs.microsoft.com/en-us/azure/cosmos-db/)
- [Shopify App Session Storage](https://github.com/Shopify/shopify-app-js/tree/main/packages/shopify-app-session-storage)
- [ContainerRequest Documentation](https://learn.microsoft.com/en-us/javascript/api/@azure/cosmos/containerrequest)