import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectOrganizationMember,
	SelectOrgSetting,
	SelectRepository,
	SelectTask,
	SelectUser,
	SelectUserSetting,
} from "@superset/db/schema";
import { localStorageCollectionOptions } from "@tanstack/db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { createHttpTrpcClient } from "../lib/trpc-http-client";

// Use Electric's built-in snake_case to camelCase mapper
const columnMapper = snakeCamelMapper();

// Helper to convert null values to undefined for tRPC compatibility
const nullToUndefined = <T extends Record<string, unknown>>(
	obj: T,
): { [K in keyof T]: T[K] extends null ? undefined : T[K] } => {
	const result = {} as { [K in keyof T]: T[K] extends null ? undefined : T[K] };
	for (const key in obj) {
		result[key] = (obj[key] === null ? undefined : obj[key]) as {
			[K in keyof T]: T[K] extends null ? undefined : T[K];
		}[Extract<keyof T, string>];
	}
	return result;
};

// ============================================
// ELECTRIC COLLECTIONS (Synced per-org)
// ============================================

export const createOrgCollections = ({
	orgId,
	electricUrl,
	apiUrl: _apiUrl,
	headers,
}: {
	orgId: string;
	electricUrl: string;
	apiUrl: string;
	headers?: Record<string, string>;
}) => {
	console.log("[createOrgCollections] Creating collections with:", {
		orgId,
		electricUrl,
		hasHeaders: !!headers,
		headerKeys: headers ? Object.keys(headers) : [],
	});

	// Create HTTP tRPC client for write operations
	const httpTrpcClient = createHttpTrpcClient({ headers });

	// Tasks Collection
	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "tasks",
					where: `organization_id = '${orgId}'`,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,

			// Write operations via tRPC HTTP client
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				// Convert null to undefined for tRPC compatibility
				const result = await httpTrpcClient.task.create.mutate(
					nullToUndefined(item) as Parameters<
						typeof httpTrpcClient.task.create.mutate
					>[0],
				);
				return { txid: result.txid };
			},

			onUpdate: async ({ transaction }) => {
				const { modified } = transaction.mutations[0];
				// Convert null to undefined for tRPC compatibility
				const result = await httpTrpcClient.task.update.mutate(
					nullToUndefined(modified) as Parameters<
						typeof httpTrpcClient.task.update.mutate
					>[0],
				);
				return { txid: result.txid };
			},

			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await httpTrpcClient.task.delete.mutate(item.id);
				return { txid: result.txid };
			},
		}),
	);

	// Repositories Collection
	const repositories = createCollection(
		electricCollectionOptions<SelectRepository>({
			id: `repositories-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "repositories",
					where: `organization_id = '${orgId}'`,
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
					where: `organization_id = '${orgId}'`,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	// Users Collection (all users in the org - read-only from members)
	const users = createCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "users",
					// Note: We might need to filter this differently
					// For now, sync all users who are members of this org
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	return {
		tasks,
		repositories,
		members,
		users,
	};
};

// ============================================
// USER COLLECTIONS (Synced per-user, cross-org)
// ============================================

export const createUserCollections = ({
	userId,
	electricUrl,
	apiUrl,
	headers,
}: {
	userId: string;
	electricUrl: string;
	apiUrl: string;
	headers?: Record<string, string>;
}) => {
	// User Settings (synced across all devices)
	const userSettings = createCollection(
		electricCollectionOptions<SelectUserSetting>({
			id: `user-settings-${userId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "user_settings",
					where: `user_id = '${userId}'`,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,

			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const response = await fetch(`${apiUrl}/user-settings`, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...headers },
					body: JSON.stringify(item),
				});
				const { txid } = await response.json();
				return { txid };
			},

			onUpdate: async ({ transaction }) => {
				const { original, modified } = transaction.mutations[0];
				const response = await fetch(`${apiUrl}/user-settings/${original.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json", ...headers },
					body: JSON.stringify(modified),
				});
				const { txid } = await response.json();
				return { txid };
			},
		}),
	);

	return {
		userSettings,
	};
};

// ============================================
// ORG SETTINGS COLLECTIONS (Synced per-org)
// ============================================

export const createOrgSettingsCollection = ({
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
	return createCollection(
		electricCollectionOptions<SelectOrgSetting>({
			id: `org-settings-${orgId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "org_settings",
					where: `organization_id = '${orgId}'`,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,

			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const response = await fetch(`${apiUrl}/org-settings`, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...headers },
					body: JSON.stringify(item),
				});
				const { txid } = await response.json();
				return { txid };
			},

			onUpdate: async ({ transaction }) => {
				const { original, modified } = transaction.mutations[0];
				const response = await fetch(`${apiUrl}/org-settings/${original.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json", ...headers },
					body: JSON.stringify(modified),
				});
				const { txid } = await response.json();
				return { txid };
			},
		}),
	);
};

// ============================================
// DEVICE COLLECTIONS (LocalStorage)
// ============================================

export interface DeviceSetting {
	key: string;
	value: unknown;
}

export const createDeviceCollections = () => {
	// Device Settings (never synced - this machine only)
	const deviceSettings = createCollection(
		localStorageCollectionOptions<DeviceSetting>({
			storageKey: "device-settings",
			getKey: (item) => item.key,
			storage: localStorage,
		}),
	);

	return {
		deviceSettings,
	};
};

// ============================================
// TYPES
// ============================================

export type OrgCollections = ReturnType<typeof createOrgCollections> & {
	orgSettings: Collection<SelectOrgSetting>;
};
export type UserCollections = ReturnType<typeof createUserCollections>;
export type DeviceCollections = ReturnType<typeof createDeviceCollections>;
