import { describe, afterAll, vi, beforeAll, afterEach } from "vitest";
import { batteryOfTests } from "./utils";
import { CosmosDBSessionStorage } from "../cosmosdb";
import { CosmosClient } from "@azure/cosmos";

const dbName = "shopitest";
const endpoint = "https://172.26.80.1:8081";
const key = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
const connectionString = `AccountEndpoint=${endpoint};AccountKey=${key}`;

vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");


describe("CosmosDBSessionStorage - Custom Partition Key", () => {
	describe("with Credentials", async () => {
		const storage = CosmosDBSessionStorage.withCredentials(endpoint, key, dbName, {
			containerName: 'SessionsPK',
			containerRequest: {
				partitionKey: "/tenantId",
			},
			getPartitionKeyById: (id: string) => "testTenant",
			getPartitionKeyByShop: (shop: string) => "testTenant",
		});

		afterAll(async () => {
			await storage.disconnect();
		});

		batteryOfTests(async () => storage);
	});

	describe("with ConnectionString", async () => {
		const storage = CosmosDBSessionStorage.withConnectionString(
			connectionString,
			dbName,
			{
				containerName: 'SessionsPK',
				containerRequest: {
					partitionKey: "/tenantId",
				},
				getPartitionKeyById: (id: string) => "testTenant",
				getPartitionKeyByShop: (shop: string) => "testTenant",
			}
		);

		afterAll(async () => {
			await storage.disconnect();
		});

		batteryOfTests(async () => storage);
	});
});

describe("CosmosDBSessionStorage - Standard Partition Key", () => {
	describe("with Credentials", async () => {
		const storage = CosmosDBSessionStorage.withCredentials(endpoint, key, dbName, {
			containerName: 'Sessions',
		});

		afterAll(async () => {
			await storage.disconnect();
		});

		batteryOfTests(async () => storage);
	});

	describe("with ConnectionString", async () => {
		const storage = CosmosDBSessionStorage.withConnectionString(
			connectionString,
			dbName,
			{
				containerName: 'Sessions',
			}
		);

		afterAll(async () => {
			await storage.disconnect();
		});

		batteryOfTests(async () => storage);
	});
});
