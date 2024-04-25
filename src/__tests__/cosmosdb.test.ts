import { describe, afterAll, vi } from "vitest";
import { batteryOfTests } from "./utils";
import { CosmosDBSessionStorage } from "../cosmosdb";

const dbName = "shopitest";

vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");

describe("CosmosDBSessionStorage with Credentials", async () => {
	const endpoint = "https://172.26.80.1:8081";
	const key =
		"C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

	const storage = CosmosDBSessionStorage.withCredentials(endpoint, key, dbName);

	afterAll(async () => {
		await storage.disconnect();
	});

	batteryOfTests(async () => storage);
});

describe("CosmosDBSessionStorage with ConnectionString", async () => {
	const connectionString =
		"AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

	const storage = CosmosDBSessionStorage.withConnectionString(
		connectionString,
		dbName
	);

	afterAll(async () => {
		await storage.disconnect();
	});

	batteryOfTests(async () => storage);
});
