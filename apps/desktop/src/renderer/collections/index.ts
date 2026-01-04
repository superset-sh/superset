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

/**
 * HTTP-based tRPC client for making API calls to the backend server.
 * Used in collections for write operations.
 */
const createHttpTrpcClient = ({
	apiUrl,
	headers,
}: {
	apiUrl: string;
	headers?: Record<string, string>;
}) => {
	return createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${apiUrl}/trpc`,
				headers,
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
	headers,
}: {
	orgId: string;
	electricUrl: string;
	apiUrl: string;
	headers?: Record<string, string>;
}) => {
	const httpTrpcClient = createHttpTrpcClient({ apiUrl, headers });

	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "tasks",
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,

			// Write operations via tRPC HTTP client
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
				headers,
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

	// Organization Members Collection (join of organization_members + users)
	const members = createCollection(
		electricCollectionOptions<SelectOrganizationMember>({
			id: `members-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "organization_members",
				},
				headers,
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
				headers,
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
