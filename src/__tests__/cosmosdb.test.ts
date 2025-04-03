import { describe, afterAll, vi, afterEach, expect, test, beforeEach } from "vitest";
import { batteryOfTests } from "./utils";
import { CosmosDBSessionStorage, getBackoffDelay } from "../cosmosdb";
import { CosmosClient, Databases } from "@azure/cosmos";
import { CONSTANTS, ERRORS } from "../constants";

const dbName = "shopitest";
const endpoint = "https://172.27.0.1:8081";
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

describe("CosmosDBSessionStorage - Passing CosmosClient", () => {
	const client: CosmosClient = new CosmosClient(connectionString);
	const storage = CosmosDBSessionStorage.withClient(client, dbName, {
		containerName: 'Sessions_Client',
	});

	afterAll(async () => {
		await storage.disconnect();
	});

	batteryOfTests(async () => storage);
});

describe("CosmosDBSessionStorage - Error Handling", () => {
	describe("Initialization Errors", () => {
		test("throws on missing credentials", () => {
			expect(() =>
				CosmosDBSessionStorage.withCredentials("", "", dbName)
			).toThrow('Endpoint and key are required');
		});

		test("throws on missing database name", () => {
			expect(() =>
				CosmosDBSessionStorage.withCredentials(endpoint, key, "")
			).toThrow('Database name is required');
		});

		test("throws on missing connection string", () => {
			expect(() =>
				CosmosDBSessionStorage.withConnectionString("", dbName)
			).toThrow(ERRORS.NO_CONNECTION);
		});
	});

	describe("Partition Key Errors", () => {
		test("throws on missing partition key resolver for custom key", async () => {
			const storage = CosmosDBSessionStorage.withCredentials(
				endpoint,
				key,
				dbName,
				{
					containerName: 'SessionsPK',
					containerRequest: {
						partitionKey: "/custom"
					}
				}
			);

			await expect(storage.loadSession("test-id"))
				.rejects
				.toThrow(ERRORS.PARTITION_KEY_ID);
		});

		test("throws on missing shop partition key resolver", async () => {
			const storage = CosmosDBSessionStorage.withCredentials(
				endpoint,
				key,
				dbName,
				{
					containerName: 'SessionsPK',
					containerRequest: {
						partitionKey: "/custom"
					}
				}
			);

			await expect(storage.findSessionsByShop("test-shop"))
				.rejects
				.toThrow(ERRORS.PARTITION_KEY_SHOP);
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});
});

describe("timeout handling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("handles initialization timeout", async () => {
		const storage = CosmosDBSessionStorage.withCredentials(
			endpoint,
			key,
			dbName
		);

		const createIfNotExistsSpy = vi.spyOn(Databases.prototype, 'createIfNotExists')
			.mockImplementation(() => new Promise(() => {
				// Never resolves to simulate timeout
			}));

		const initializationPromise = (async () => {
			try {
				await storage.ready;
				return "initialized";
			} catch (error) {
				return error.message;
			}
		})();

		for (let i = 0; i <= CONSTANTS.MAX_RETRIES; i++) {
			await vi.advanceTimersByTimeAsync(CONSTANTS.TIMEOUT_MS);

			if (i < CONSTANTS.MAX_RETRIES) {
				const backoffDelay = getBackoffDelay(i);
				await vi.advanceTimersByTimeAsync(backoffDelay);
			}
		}

		const result = await initializationPromise;
		expect(result).toBe(ERRORS.TIMEOUT);
		expect(createIfNotExistsSpy).toHaveBeenCalledTimes(CONSTANTS.MAX_RETRIES);
	});

	test("handles operation timeout", async () => {
		const storage = CosmosDBSessionStorage.withCredentials(
			endpoint,
			key,
			dbName
		);

		const createIfNotExistsSpy = vi.spyOn(Databases.prototype, 'createIfNotExists')
			.mockImplementation(() => new Promise(() => {
				// Never resolves to simulate timeout
			}));

		const operationPromise = (async () => {
			try {
				return await storage.loadSession("test-id");
			} catch (error) {
				return error.message;
			}
		})();

		for (let i = 0; i <= CONSTANTS.MAX_RETRIES; i++) {
			await vi.runOnlyPendingTimersAsync();
			await vi.advanceTimersByTimeAsync(CONSTANTS.TIMEOUT_MS);
			if (i < CONSTANTS.MAX_RETRIES) {
				await vi.advanceTimersByTimeAsync(
					getBackoffDelay(i)
				);
			}
		}

		const result = await operationPromise;
		expect(result).toBe(ERRORS.TIMEOUT);
		expect(createIfNotExistsSpy).toHaveBeenCalledTimes(CONSTANTS.MAX_RETRIES);
	});
});