import {
	Container,
	ContainerRequest,
	CosmosClient,
	OperationInput,
	SqlQuerySpec,
} from "@azure/cosmos";
import { Session, SessionParams } from "@shopify/shopify-api";
import { SessionStorage } from "@shopify/shopify-app-session-storage";

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

export class CosmosDBSessionStorage implements SessionStorage {
	static withCredentials(
		endpoint: string,
		key: string,
		dbName: string,
		opts?: Partial<CosmosDBSessionStorageOptions>
	) {
		return new CosmosDBSessionStorage(
			dbName,
			`AccountEndpoint=${endpoint};AccountKey=${key}`,
			undefined,
			opts
		);
	}

	static withConnectionString(
		connectionString: string,
		dbName: string,
		opts?: Partial<CosmosDBSessionStorageOptions>
	) {
		return new CosmosDBSessionStorage(dbName, connectionString, undefined, opts);
	}

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

	public async storeSession(session: CosmosDBSession): Promise<boolean> {
		await this.ready;

		if (this.options.containerRequest?.partitionKey) {
			const pk = this.options.containerRequest?.partitionKey.toString().replace('/', '');
			session[pk] = this.getPartitionKeyById(session.id);
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

		throw "PartitionKey is not ID and getPartitionKeyById was not defined.";
	}

	private getPartitionKeyByShop(shop: string) {
		const isPKId = this.options.containerRequest?.partitionKey == "/id";

		if (this.options.getPartitionKeyByShop) {
			return this.options.getPartitionKeyByShop(shop);
		} else if (isPKId) {
			return undefined;
		}

		throw "PartitionKey is not ID and getPartitionKeyByShop was not defined.";
	}

	private get container(): Container {
		return this.client
			.database(this.dbName)
			.container(this.options.containerName);
	}

	private async init(connectionString: string | undefined, client: CosmosClient | undefined = undefined) {
		if (!connectionString && !client) throw 'No connection string or client provided.';
		this.client = client ?? new CosmosClient(connectionString!);

		const retry = 0;
		const maxRetries = 3;
		try {
			await this.client.databases.createIfNotExists({ id: this.dbName });
			await this.client.database(this.dbName).containers.createIfNotExists({
				...this.options.containerRequest,
				id: this.options.containerName,
			});
		} catch (e) {
			await delay(500);
			if (retry < maxRetries) this.init(connectionString, client);
		}
	}
}

function delay(ms: number) {
	return new Promise<void>(resolve => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}