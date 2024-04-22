# Session Storage for Cosmosdb - Shopify App

Shopify App Session Storage for Azure Cosmos DB

Create an instance by using `withCredentials` static method:

```javascript
const cosmosDBSessionStorage = CosmosDBSessionStorage.withCredentials(
    "endpoint",
    "key",
    "dbName"
);
```

Optionally, you can use an additional configuration by adding a `CosmosDBSessionStorageOptions` object that includes the ability to change the container name and add `ContainerRequest` parameter to pass to Azure CosmosDB container creation. Refer to the [Official ContainerRequest Docs](https://learn.microsoft.com/en-us/javascript/api/@azure/cosmos/containerrequest?view=azure-node-latest)

```javascript
const cosmosDBSessionStorage = CosmosDBSessionStorage.withCredentials(
    "endpoint",
    "key",
    "dbName",
    {
        containerName: "shopify_sessions",
        containerRequest: {
            partitionKey: "/id",
            ...
        },
    }
);
```
