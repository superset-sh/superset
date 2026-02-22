import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectAgentCommand,
	SelectChatSession,
	SelectDevicePresence,
	SelectIntegrationConnection,
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectProject,
	SelectSessionHost,
	SelectSubscription,
	SelectTask,
	SelectTaskStatus,
	SelectUser,
	SelectWorkspace,
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
const electricUrl = `${env.NEXT_PUBLIC_ELECTRIC_URL}/v1/shape`;

const apiKeyDisplaySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	start: z.string().nullable(),
	createdAt: z.coerce.date(),
	lastRequest: z.coerce.date().nullable(),
});

type ApiKeyDisplay = z.infer<typeof apiKeyDisplaySchema>;

type IntegrationConnectionDisplay = Omit<
	SelectIntegrationConnection,
	"accessToken" | "refreshToken"
>;

interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	workspaces: Collection<SelectWorkspace>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
	agentCommands: Collection<SelectAgentCommand>;
	devicePresence: Collection<SelectDevicePresence>;
	integrationConnections: Collection<IntegrationConnectionDisplay>;
	subscriptions: Collection<SelectSubscription>;
	apiKeys: Collection<ApiKeyDisplay>;
	chatSessions: Collection<SelectChatSession>;
	sessionHosts: Collection<SelectSessionHost>;
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

const electricHeaders = {
	Authorization: () => {
		const token = getAuthToken();
		return token ? `Bearer ${token}` : "";
	},
	"X-Electric-Backend": "cloud",
};

const organizationsCollection = createCollection(
	electricCollectionOptions<SelectOrganization>({
		id: "organizations",
		shapeOptions: {
			url: electricUrl,
			params: { table: "auth.organizations" },
			headers: electricHeaders,
			columnMapper,
		},
		getKey: (item) => item.id,
	}),
);

function createOrgCollections(organizationId: string): OrgCollections {
	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "tasks",
					organizationId,
				},
				headers: electricHeaders,
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
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const projects = createCollection(
		electricCollectionOptions<SelectProject>({
			id: `projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "projects",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const workspaces = createCollection(
		electricCollectionOptions<SelectWorkspace>({
			id: `workspaces-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "workspaces",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
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
				headers: electricHeaders,
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
				headers: electricHeaders,
				columnMapper,
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
				headers: electricHeaders,
				columnMapper,
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
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const result = await apiClient.agent.updateCommand.mutate({
					...changes,
					id: original.id,
				});
				return { txid: result.txid };
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
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const integrationConnections = createCollection(
		electricCollectionOptions<IntegrationConnectionDisplay>({
			id: `integration_connections-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "integration_connections",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const subscriptions = createCollection(
		electricCollectionOptions<SelectSubscription>({
			id: `subscriptions-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "subscriptions",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const apiKeys = createCollection(
		electricCollectionOptions<ApiKeyDisplay>({
			id: `apikeys-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "auth.apikeys",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const chatSessions = createCollection(
		electricCollectionOptions<SelectChatSession>({
			id: `chat_sessions-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "chat_sessions",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const sessionHosts = createCollection(
		electricCollectionOptions<SelectSessionHost>({
			id: `session_hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "session_hosts",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	return {
		tasks,
		taskStatuses,
		projects,
		workspaces,
		members,
		users,
		invitations,
		agentCommands,
		devicePresence,
		integrationConnections,
		subscriptions,
		apiKeys,
		chatSessions,
		sessionHosts,
	};
}

/**
 * Preload collections for an organization by starting Electric sync.
 * Collections are lazy — they don't fetch data until subscribed or preloaded.
 * Call this eagerly so data is ready when the user switches orgs.
 */
export async function preloadCollections(
	organizationId: string,
): Promise<void> {
	const { organizations, ...orgCollections } = getCollections(organizationId);
	await Promise.allSettled(
		Object.values(orgCollections).map((c) =>
			(c as Collection<object>).preload(),
		),
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
	};
}
