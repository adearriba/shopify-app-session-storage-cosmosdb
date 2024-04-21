import { describe, beforeAll, afterAll, vi } from "vitest";
import { batteryOfTests } from "./utils";
import { CosmosDBSessionStorage } from "../cosmosdb";

const endpoint = "https://172.26.80.1:8081";
const key =
	"C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
const dbName = "shopitest";

describe("CosmosDBSessionStorage", async () => {
	vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");

	const storage: CosmosDBSessionStorage =
		CosmosDBSessionStorage.withCredentials(endpoint, key, dbName);

	//await waitUntilReady(storage.ready, 5000);

	afterAll(async () => {
		await storage.disconnect();
	});

	storage.ready;

	batteryOfTests(async () => storage);
});

function waitUntilReady(ready: Promise<void>, maxTime: number): Promise<void> {
	return new Promise((resolve, reject) => {
		Promise.race([
			ready,
			setTimeout(() => reject(`Maxtime reached: ${maxTime}ms`), maxTime),
		]);
	});
}
