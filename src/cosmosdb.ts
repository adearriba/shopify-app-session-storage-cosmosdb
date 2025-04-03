import {
	Container,
	ContainerRequest,
	CosmosClient,
	OperationInput,
	SqlQuerySpec,
} from "@azure/cosmos";
import { Session, SessionParams } from "@shopify/shopify-api";
import { SessionStorage } from "@shopify/shopify-app-session-storage";
import { CONSTANTS, ERRORS } from "./constants";

export interface CosmosDBSessionStorageOptions {
	containerName: string;
	containerRequest?: ContainerRequest;
	getPartitionKeyById?: (id: string) => string;
	getPartitionKeyByShop?: (id: string) => string;
}
const defaultCosmosDBSessionStorageOptions: CosmosDBSessionStorageOptions = {
	containerName: "shopify_sessions",
	containerRequest: {
		partitionKey: "/id",
	},
};

type CosmosDBSession = Session & {
	[key: string]: string
};

export type CosmosError = Error & {
	code?: number;
};

export class CosmosDBSessionStorage implements SessionStorage {
	/**
	 * Creates a new session storage instance using Cosmos DB credentials
	 * @param endpoint - Cosmos DB endpoint
	 * @param key - Cosmos DB key
	 * @param dbName - Name of the database to use
	 * @param opts - Optional configuration options
	 * @returns A new CosmosDBSessionStorage instance
	 */
	static withCredentials(
		endpoint: string,
		key: string,
		dbName: string,
		opts?: Partial<CosmosDBSessionStorageOptions>
	) {
		if (emptyOrUndefined(endpoint) || emptyOrUndefined(key)) {
			throw new Error('Endpoint and key are required');
		}
		if (emptyOrUndefined(dbName)) {
			throw new Error('Database name is required');
		}

		return new CosmosDBSessionStorage(
			dbName,
			`AccountEndpoint=${endpoint};AccountKey=${key}`,
			undefined,
			opts
		);
	}

	/**
	 * Creates a new session storage instance using a Cosmos DB connection string
	 * @param connectionString - Cosmos DB connection string
	 * @param dbName - Name of the database to use
	 * @param opts - Optional configuration options
	 * @returns A new CosmosDBSessionStorage instance
	 */
	static withConnectionString(
		connectionString: string,
		dbName: string,
		opts?: Partial<CosmosDBSessionStorageOptions>
	) {
		if (emptyOrUndefined(connectionString)) {
			throw new Error(ERRORS.NO_CONNECTION);
		}
		if (emptyOrUndefined(dbName)) {
			throw new Error('Database name is required');
		}

		return new CosmosDBSessionStorage(dbName, connectionString, undefined, opts);
	}

	/**
	 * Creates a new session storage instance using a Cosmos DB client
	 * @param cosmosClient - Existing Cosmos DB client instance
	 * @param dbName - Name of the database to use
	 * @param opts - Optional configuration options
	 * @returns A new CosmosDBSessionStorage instance
	 */
	static withClient(
		cosmosClient: CosmosClient,
		dbName: string,
		opts?: Partial<CosmosDBSessionStorageOptions>
	) {
		return new CosmosDBSessionStorage(dbName, undefined, cosmosClient, opts);
	}

	public readonly ready: Promise<void>;
	private client: CosmosClient;
	private options: CosmosDBSessionStorageOptions;

	private constructor(
		private dbName: string,
		connectionString: string | undefined,
		cosmosClient: CosmosClient | undefined = undefined,
		opts: Partial<CosmosDBSessionStorageOptions> = {},
	) {
		this.options = { ...defaultCosmosDBSessionStorageOptions, ...opts };
		this.ready = this.init(connectionString, cosmosClient);
	}

	public async storeSession(session: CosmosDBSession | Session): Promise<boolean> {
		await this.ready;

		if (this.options.containerRequest?.partitionKey) {
			const pk = this.options.containerRequest?.partitionKey.toString().replace('/', '');
			(session as CosmosDBSession)[pk] = this.getPartitionKeyById(session.id);
		}

		await this.container.items.upsert(session);
		return true;
	}

	public async loadSession(id: string): Promise<CosmosDBSession | undefined> {
		await this.ready;

		const { resource } = await this.container
			.item(id, this.getPartitionKeyById(id))
			.read<CosmosDBSession>();

		if (resource === undefined) return undefined;

		if (resource.expires) {
			resource.expires = new Date(resource.expires);
		}

		return new Session(resource as SessionParams) as CosmosDBSession;
	}

	public async deleteSession(id: string): Promise<boolean> {
		await this.ready;

		const { resource } = await this.container
			.item(id, this.getPartitionKeyById(id))
			.read();
		if (resource === undefined) return true;

		await this.container.item(id, this.getPartitionKeyById(id)).delete();

		return true;
	}

	public async deleteSessions(ids: string[]): Promise<boolean> {
		await this.ready;

		const operations: OperationInput[] = ids.map((id) => {
			return {
				id: id,
				operationType: "Delete",
				partitionKey: this.getPartitionKeyById(id),
			};
		});

		await this.container.items.bulk(operations);
		return true;
	}

	public async findSessionsByShop(shop: string): Promise<CosmosDBSession[]> {
		await this.ready;
		const querySpec: SqlQuerySpec = {
			query: `SELECT * FROM Sessions c WHERE c.shop = @shop`,
			parameters: [
				{
					name: "@shop",
					value: shop,
				},
			],
		};

		const { resources } = await this.container!.items.query<Session>(
			querySpec, {
			partitionKey: this.getPartitionKeyByShop(shop),
		}
		).fetchAll();

		return resources.map((session) => new Session(session as SessionParams) as CosmosDBSession);
	}

	public disconnect(): void {
		this.client.dispose();
	}

	private getPartitionKeyById(id: string) {
		const isPKId = this.options.containerRequest?.partitionKey == "/id";

		if (this.options.getPartitionKeyById) {
			return this.options.getPartitionKeyById(id);
		} else if (isPKId) {
			return id;
		}

		throw new Error(ERRORS.PARTITION_KEY_ID);
	}

	private getPartitionKeyByShop(shop: string) {
		const isPKId = this.options.containerRequest?.partitionKey == "/id";

		if (this.options.getPartitionKeyByShop) {
			return this.options.getPartitionKeyByShop(shop);
		} else if (isPKId) {
			return undefined;
		}

		throw new Error(ERRORS.PARTITION_KEY_SHOP);
	}

	private get container(): Container {
		return this.client
			.database(this.dbName)
			.container(this.options.containerName);
	}

	private async init(
		connectionString: string | undefined,
		client: CosmosClient | undefined = undefined,
		retryCount = 0) {
		if (!connectionString && !client) throw new Error(ERRORS.NO_CONNECTION);

		this.client = client ?? new CosmosClient(connectionString!);
		try {
			await Promise.race([
				this.initializeDatabase(),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error(ERRORS.TIMEOUT)), CONSTANTS.TIMEOUT_MS)
				)
			]);
		} catch (e) {
			const error = e as CosmosError;
			if (retryCount >= CONSTANTS.MAX_RETRIES) {
				if (error.message === ERRORS.TIMEOUT) throw e;

				throw new Error(
					`${ERRORS.INITIALIZATION_FAILED} Code: ${error.code}, Message: ${error.message}`
				);
			}

			if (error.code === 401) {
				throw new Error(ERRORS.INVALID_CREDENTIALS);
			}

			const delayTimeout = getBackoffDelay(retryCount);
			console.warn(`Initialization attempt ${retryCount + 1} failed, retrying in ${delayTimeout}ms...`);
			await this.delay(delayTimeout);
			await this.init(connectionString, client, retryCount + 1);
		}
	}

	private async initializeDatabase() {
		await this.client.databases.createIfNotExists({ id: this.dbName });
		await this.client.database(this.dbName).containers.createIfNotExists({
			...this.options.containerRequest,
			id: this.options.containerName,
		});
		console.info('Successfully initialized Cosmos DB connection');
	}

	/**
	 * Creates a promise that resolves after a specified delay
	 * @param ms Delay in milliseconds
	 * @returns Promise that resolves after the delay
	 */
	private async delay(ms: number): Promise<void> {
		return new Promise((resolve) => {
			const timeoutId = setTimeout(() => {
				clearTimeout(timeoutId);
				resolve();
			}, ms);
		});
	}
}

export function getBackoffDelay(retryCount: number, baseDelay = CONSTANTS.BASE_DELAY_MS): number {
	return Math.min(baseDelay * Math.pow(2, retryCount), CONSTANTS.MAX_DELAY_MS);
}

function emptyOrUndefined(value?: string | null): boolean {
	return value === undefined || value === null || value === '';
}