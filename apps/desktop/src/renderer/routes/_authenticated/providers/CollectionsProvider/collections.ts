import { FetchError, snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectAgentCommand,
	SelectDevicePresence,
	SelectIntegrationConnection,
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
import { z } from "zod";

const columnMapper = snakeCamelMapper();
const electricUrl = `${env.NEXT_PUBLIC_API_URL}/api/electric/v1/shape`;

function createShapeErrorHandler({ collectionId }: { collectionId: string }) {
	let consecutiveErrors = 0;

	return async (error: Error): Promise<Record<string, unknown>> => {
		consecutiveErrors++;

		if (consecutiveErrors > 50) {
			console.error(
				`[electric/${collectionId}] ${consecutiveErrors} consecutive errors, backing off 30s`,
			);
			await new Promise((r) => setTimeout(r, 30_000));
			consecutiveErrors = 0;
			return {};
		}

		if (
			error instanceof FetchError &&
			(error.status === 401 || error.status === 403)
		) {
			console.warn(
				`[electric/${collectionId}] Auth error (${error.status}), refreshing token`,
			);
			await new Promise((r) => setTimeout(r, 2_000));
			const token = getAuthToken();
			return { headers: { Authorization: token ? `Bearer ${token}` : "" } };
		}

		console.warn(
			`[electric/${collectionId}] Stream error, retrying:`,
			error.message,
		);
		await new Promise((r) => setTimeout(r, 2_000));
		return {};
	};
}

interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	repositories: Collection<SelectRepository>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
	agentCommands: Collection<SelectAgentCommand>;
	devicePresence: Collection<SelectDevicePresence>;
	integrationConnections: Collection<SelectIntegrationConnection>;
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
			onError: createShapeErrorHandler({ collectionId: "organizations" }),
		},
		getKey: (item) => item.id,
	}),
);

const apiKeyDisplaySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	start: z.string().nullable(),
	createdAt: z.coerce.date(),
	lastRequest: z.coerce.date().nullable(),
});

type ApiKeyDisplay = z.infer<typeof apiKeyDisplaySchema>;

const apiKeysCollection = createCollection(
	electricCollectionOptions<ApiKeyDisplay>({
		id: "apikeys",
		shapeOptions: {
			url: electricUrl,
			params: { table: "auth.apikeys" },
			headers: {
				Authorization: () => {
					const token = getAuthToken();
					return token ? `Bearer ${token}` : "";
				},
			},
			columnMapper,
			onError: createShapeErrorHandler({ collectionId: "apikeys" }),
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
				onError: createShapeErrorHandler({
					collectionId: `tasks-${organizationId}`,
				}),
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
				onError: createShapeErrorHandler({
					collectionId: `task_statuses-${organizationId}`,
				}),
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
				onError: createShapeErrorHandler({
					collectionId: `repositories-${organizationId}`,
				}),
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
				onError: createShapeErrorHandler({
					collectionId: `members-${organizationId}`,
				}),
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
				onError: createShapeErrorHandler({
					collectionId: `users-${organizationId}`,
				}),
			},
			getKey: (item) => item.id,
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
				onError: createShapeErrorHandler({
					collectionId: `invitations-${organizationId}`,
				}),
			},
			getKey: (item) => item.id,
		}),
	);

	const agentCommands = createCollection(
		electricCollectionOptions<SelectAgentCommand>({
			id: `agent_commands-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "agent_commands",
					organizationId,
				},
				headers,
				columnMapper,
				onError: createShapeErrorHandler({
					collectionId: `agent_commands-${organizationId}`,
				}),
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				if (!changes.status) {
					return { txid: Date.now() };
				}
				const result = await apiClient.agent.updateCommand.mutate({
					id: original.id,
					status: changes.status,
					claimedBy: changes.claimedBy ?? undefined,
					claimedAt: changes.claimedAt ?? undefined,
					result: changes.result ?? undefined,
					error: changes.error ?? undefined,
					executedAt: changes.executedAt ?? undefined,
				});
				return { txid: Number(result.txid) };
			},
		}),
	);

	const devicePresence = createCollection(
		electricCollectionOptions<SelectDevicePresence>({
			id: `device_presence-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "device_presence",
					organizationId,
				},
				headers,
				columnMapper,
				onError: createShapeErrorHandler({
					collectionId: `device_presence-${organizationId}`,
				}),
			},
			getKey: (item) => item.id,
		}),
	);

	const integrationConnections = createCollection(
		electricCollectionOptions<SelectIntegrationConnection>({
			id: `integration_connections-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "integration_connections",
					organizationId,
				},
				headers,
				columnMapper,
				onError: createShapeErrorHandler({
					collectionId: `integration_connections-${organizationId}`,
				}),
			},
			getKey: (item) => item.id,
		}),
	);

	return {
		tasks,
		taskStatuses,
		repositories,
		members,
		users,
		invitations,
		agentCommands,
		devicePresence,
		integrationConnections,
	};
}

export async function disposeCollections(
	organizationId: string,
): Promise<void> {
	const orgCollections = collectionsCache.get(organizationId);
	if (!orgCollections) return;

	await Promise.allSettled(
		Object.values(orgCollections).map((c) =>
			(c as Collection<object>).cleanup(),
		),
	);
	collectionsCache.delete(organizationId);
	console.log(
		`[electric/cleanup] Disposed collections for org: ${organizationId}`,
	);
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
		apiKeys: apiKeysCollection,
	};
}
