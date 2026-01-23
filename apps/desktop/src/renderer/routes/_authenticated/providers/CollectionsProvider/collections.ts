import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectCloudWorkspace,
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectRepository,
	SelectTask,
	SelectTaskStatus,
	SelectUser,
} from "@superset/db/schema";
import type { AppRouter } from "@superset/trpc";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { env } from "renderer/env.renderer";
import { getAuthToken } from "renderer/lib/auth-client";
import superjson from "superjson";

const columnMapper = snakeCamelMapper();
const electricUrl = `${env.NEXT_PUBLIC_API_URL}/api/electric/v1/shape`;

interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	repositories: Collection<SelectRepository>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	cloudWorkspaces: Collection<SelectCloudWorkspace>;
	invitations: Collection<SelectInvitation>;
}

// Per-org collections cache
const collectionsCache = new Map<string, OrgCollections>();

// Singleton API client with dynamic auth headers
const apiClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			headers: () => {
				const token = getAuthToken();
				return token ? { Authorization: `Bearer ${token}` } : {};
			},
			transformer: superjson,
		}),
	],
});

const organizationsCollection = createCollection(
	electricCollectionOptions<SelectOrganization>({
		id: "organizations",
		shapeOptions: {
			url: electricUrl,
			params: { table: "auth.organizations" },
			headers: {
				Authorization: () => {
					const token = getAuthToken();
					return token ? `Bearer ${token}` : "";
				},
			},
			columnMapper,
		},
		getKey: (item) => item.id,
	}),
);

function createOrgCollections(organizationId: string): OrgCollections {
	const headers = {
		Authorization: () => {
			const token = getAuthToken();
			return token ? `Bearer ${token}` : "";
		},
	};

	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "tasks",
					organizationId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await apiClient.task.create.mutate(item);
				return { txid: result.txid };
			},
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const result = await apiClient.task.update.mutate({
					...changes,
					id: original.id,
				});
				return { txid: result.txid };
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.task.delete.mutate(item.id);
				return { txid: result.txid };
			},
		}),
	);

	const taskStatuses = createCollection(
		electricCollectionOptions<SelectTaskStatus>({
			id: `task_statuses-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "task_statuses",
					organizationId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const repositories = createCollection(
		electricCollectionOptions<SelectRepository>({
			id: `repositories-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "repositories",
					organizationId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await apiClient.repository.create.mutate(item);
				return { txid: result.txid };
			},
			onUpdate: async ({ transaction }) => {
				const { modified } = transaction.mutations[0];
				const result = await apiClient.repository.update.mutate(modified);
				return { txid: result.txid };
			},
		}),
	);

	const members = createCollection(
		electricCollectionOptions<SelectMember>({
			id: `members-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.members",
					organizationId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.users",
					organizationId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const cloudWorkspaces = createCollection(
		electricCollectionOptions<SelectCloudWorkspace>({
			id: `cloud_workspaces-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "cloud_workspaces",
					organizationId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				const result = await apiClient.cloudWorkspace.create.mutate({
					repositoryId: item.repositoryId,
					name: item.name,
					branch: item.branch ?? undefined,
					providerType: item.providerType,
					autoStopMinutes: item.autoStopMinutes,
				});
				return { txid: result.txid };
			},
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const result = await apiClient.cloudWorkspace.update.mutate({
					workspaceId: original.id,
					...changes,
				});
				return { txid: result.txid };
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.cloudWorkspace.delete.mutate({
					workspaceId: item.id,
				});
				return { txid: result.txid };
			},
		}),
	);

	const invitations = createCollection(
		electricCollectionOptions<SelectInvitation>({
			id: `invitations-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.invitations",
					organizationId,
				},
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	return { tasks, taskStatuses, repositories, members, users, cloudWorkspaces, invitations };
}

/**
 * Get collections for an organization, creating them if needed.
 * Collections are cached per org for instant switching.
 * Auth token is read dynamically via getAuthToken() - no need to pass it.
 */
export function getCollections(organizationId: string) {
	// Get or create org-specific collections
	if (!collectionsCache.has(organizationId)) {
		collectionsCache.set(organizationId, createOrgCollections(organizationId));
	}

	const orgCollections = collectionsCache.get(organizationId);
	if (!orgCollections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return {
		...orgCollections,
		organizations: organizationsCollection,
	};
}
