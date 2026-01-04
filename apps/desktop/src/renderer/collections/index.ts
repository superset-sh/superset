import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectOrganizationMember,
	SelectRepository,
	SelectTask,
	SelectUser,
} from "@superset/db/schema";
import type { AppRouter } from "@superset/trpc";
import { localStorageCollectionOptions } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const columnMapper = snakeCamelMapper();

const createHttpTrpcClient = ({
	apiUrl,
	getHeaders,
}: {
	apiUrl: string;
	getHeaders: () => Record<string, string>;
}) => {
	return createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${apiUrl}/api/trpc`,
				headers: getHeaders,
				transformer: superjson,
			}),
		],
	});
};

export interface DeviceSetting {
	key: string;
	value: unknown;
}

export const createCollections = ({
	orgId,
	electricUrl,
	apiUrl,
	getHeaders,
}: {
	orgId: string;
	electricUrl: string;
	apiUrl: string;
	getHeaders: () => Record<string, string>;
}) => {
	const httpTrpcClient = createHttpTrpcClient({ apiUrl, getHeaders });

	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "tasks",
				},
				headers: getHeaders(),
				columnMapper,
			},
			getKey: (item) => item.id,

			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await httpTrpcClient.task.create.mutate(item);
				return { txid: result.txid };
			},

			onUpdate: async ({ transaction }) => {
				const { modified } = transaction.mutations[0];
				const result = await httpTrpcClient.task.update.mutate(modified);
				return { txid: result.txid };
			},

			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await httpTrpcClient.task.delete.mutate(item.id);
				return { txid: result.txid };
			},
		}),
	);

	const repositories = createCollection(
		electricCollectionOptions<SelectRepository>({
			id: `repositories-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "repositories",
				},
				headers: getHeaders(),
				columnMapper,
			},
			getKey: (item) => item.id,

			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await httpTrpcClient.repository.create.mutate(item);
				return { txid: result.txid };
			},

			onUpdate: async ({ transaction }) => {
				const { modified } = transaction.mutations[0];
				const result = await httpTrpcClient.repository.update.mutate(modified);
				return { txid: result.txid };
			},
		}),
	);

	const members = createCollection(
		electricCollectionOptions<SelectOrganizationMember>({
			id: `members-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "organization_members",
				},
				headers: getHeaders(),
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "users",
				},
				headers: getHeaders(),
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const deviceSettings = createCollection(
		localStorageCollectionOptions<DeviceSetting>({
			storageKey: "device-settings",
			getKey: (item) => item.key,
			storage: localStorage,
		}),
	);

	return {
		tasks,
		repositories,
		members,
		users,
		deviceSettings,
	};
};

export type Collections = ReturnType<typeof createCollections>;
