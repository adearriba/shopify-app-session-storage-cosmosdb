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
}
const defaultCosmosDBSessionStorageOptions: CosmosDBSessionStorageOptions = {
	containerName: "shopify_sessions",
	containerRequest: {
		partitionKey: "/id",
	},
};

export class CosmosDBSessionStorage implements SessionStorage {
	static withCredentials(
		endpoint: string,
		key: string,
		dbName: string,
		opts?: Partial<CosmosDBSessionStorageOptions>
	) {
		return new CosmosDBSessionStorage(
			`AccountEndpoint=${endpoint};AccountKey=${key}`,
			dbName,
			opts
		);
	}

	static withConnectionString(
		connectionString: string,
		dbName: string,
		opts?: Partial<CosmosDBSessionStorageOptions>
	) {
		return new CosmosDBSessionStorage(connectionString, dbName, opts);
	}

	public readonly ready: Promise<void>;
	private client: CosmosClient;
	private options: CosmosDBSessionStorageOptions;

	private constructor(
		private connectionString: string,
		private dbName: string,
		opts: Partial<CosmosDBSessionStorageOptions> = {}
	) {
		this.options = { ...defaultCosmosDBSessionStorageOptions, ...opts };
		this.ready = this.init();
	}

	public async storeSession(session: Session): Promise<boolean> {
		await this.ready;

		await this.container.items.upsert(session);
		return true;
	}

	public async loadSession(id: string): Promise<Session | undefined> {
		await this.ready;

		const { resource } = await this.container
			.item(id, this.getPartitionKey(id))
			.read<Session>();

		if (resource === undefined) return undefined;

		if (resource.expires) {
			resource.expires = new Date(resource.expires);
		}

		return new Session(resource as SessionParams);
	}

	public async deleteSession(id: string): Promise<boolean> {
		await this.ready;

		const { resource } = await this.container
			.item(id, this.getPartitionKey(id))
			.read();
		if (resource === undefined) return true;

		await this.container.item(id, this.getPartitionKey(id)).delete();

		return true;
	}

	public async deleteSessions(ids: string[]): Promise<boolean> {
		await this.ready;

		const operations: OperationInput[] = ids.map((id) => {
			return {
				id: id,
				operationType: "Delete",
				partitionKey: this.getPartitionKey(id),
			};
		});

		await this.container.items.bulk(operations);
		return true;
	}

	public async findSessionsByShop(shop: string): Promise<Session[]> {
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
			querySpec
		).fetchAll();

		return resources.map((session) => new Session(session as SessionParams));
	}

	public disconnect(): void {
		this.client.dispose();
	}

	private getPartitionKey(id: string) {
		return this.options.containerRequest?.partitionKey == "/id"
			? id
			: undefined;
	}

	private get container(): Container {
		return this.client
			.database(this.dbName)
			.container(this.options.containerName);
	}

	private async init() {
		this.client = new CosmosClient(this.connectionString);

		await this.client.databases.createIfNotExists({ id: this.dbName });
		await this.client.database(this.dbName).containers.createIfNotExists({
			...this.options.containerRequest,
			id: this.options.containerName,
		});
	}
}
