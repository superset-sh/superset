import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectAgentCommand,
	SelectChatSession,
	SelectGithubPullRequest,
	SelectGithubRepository,
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
	SelectV2Client,
	SelectV2Host,
	SelectV2HostProject,
	SelectV2Project,
	SelectV2UsersHosts,
	SelectV2Workspace,
	SelectWorkspace,
} from "@superset/db/schema";
import type { AppRouter } from "@superset/trpc";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type {
	Collection,
	LocalStorageCollectionUtils,
} from "@tanstack/react-db";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { env } from "renderer/env.renderer";
import { getAuthToken, getJwt } from "renderer/lib/auth-client";
import superjson from "superjson";
import { z } from "zod";
import {
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionRow,
	dashboardSidebarProjectSchema,
	dashboardSidebarSectionSchema,
	type PendingWorkspaceRow,
	pendingWorkspaceSchema,
	type V2TerminalPresetRow,
	v2TerminalPresetSchema,
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";

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

export interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	v2Hosts: Collection<SelectV2Host>;
	v2Clients: Collection<SelectV2Client>;
	v2UsersHosts: Collection<SelectV2UsersHosts>;
	v2Projects: Collection<SelectV2Project>;
	v2Workspaces: Collection<SelectV2Workspace>;
	v2HostProjects: Collection<SelectV2HostProject>;
	workspaces: Collection<SelectWorkspace>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
	agentCommands: Collection<SelectAgentCommand>;
	integrationConnections: Collection<IntegrationConnectionDisplay>;
	subscriptions: Collection<SelectSubscription>;
	apiKeys: Collection<ApiKeyDisplay>;
	chatSessions: Collection<SelectChatSession>;
	sessionHosts: Collection<SelectSessionHost>;
	githubRepositories: Collection<SelectGithubRepository>;
	githubPullRequests: Collection<SelectGithubPullRequest>;
	v2SidebarProjects: Collection<
		DashboardSidebarProjectRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarProjectSchema,
		z.input<typeof dashboardSidebarProjectSchema>
	>;
	v2WorkspaceLocalState: Collection<
		WorkspaceLocalStateRow,
		string,
		LocalStorageCollectionUtils,
		typeof workspaceLocalStateSchema,
		z.input<typeof workspaceLocalStateSchema>
	>;
	v2SidebarSections: Collection<
		DashboardSidebarSectionRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarSectionSchema,
		z.input<typeof dashboardSidebarSectionSchema>
	>;
	v2TerminalPresets: Collection<
		V2TerminalPresetRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2TerminalPresetSchema,
		z.input<typeof v2TerminalPresetSchema>
	>;
	pendingWorkspaces: Collection<
		PendingWorkspaceRow,
		string,
		LocalStorageCollectionUtils,
		typeof pendingWorkspaceSchema,
		z.input<typeof pendingWorkspaceSchema>
	>;
}

// Per-org collections cache
const collectionsCache = new Map<string, OrgCollections>();

function getCollectionsCacheKey(organizationId: string): string {
	return organizationId;
}

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
		const token = getJwt();
		return token ? `Bearer ${token}` : "";
	},
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

	const v2Projects = createCollection(
		electricCollectionOptions<SelectV2Project>({
			id: `v2_projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_projects",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Hosts = createCollection(
		electricCollectionOptions<SelectV2Host>({
			id: `v2_hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_hosts",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Clients = createCollection(
		electricCollectionOptions<SelectV2Client>({
			id: `v2_clients-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_clients",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2UsersHosts = createCollection(
		electricCollectionOptions<SelectV2UsersHosts>({
			id: `v2_users_hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_users_hosts",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Workspaces = createCollection(
		electricCollectionOptions<SelectV2Workspace>({
			id: `v2_workspaces-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_workspaces",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2HostProjects = createCollection(
		electricCollectionOptions<SelectV2HostProject>({
			id: `v2_host_projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "v2_host_projects",
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

	const githubRepositories = createCollection(
		electricCollectionOptions<SelectGithubRepository>({
			id: `github_repositories-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "github_repositories",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const githubPullRequests = createCollection(
		electricCollectionOptions<SelectGithubPullRequest>({
			id: `github_pull_requests-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: {
					table: "github_pull_requests",
					organizationId,
				},
				headers: electricHeaders,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2SidebarProjects = createCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_projects-${organizationId}`,
			storageKey: `v2-sidebar-projects-${organizationId}`,
			schema: dashboardSidebarProjectSchema,
			getKey: (item) => item.projectId,
		}),
	);

	const v2WorkspaceLocalState = createCollection(
		localStorageCollectionOptions({
			id: `v2_workspace_local_state-${organizationId}`,
			storageKey: `v2-workspace-local-state-${organizationId}`,
			schema: workspaceLocalStateSchema,
			getKey: (item) => item.workspaceId,
		}),
	);

	const v2SidebarSections = createCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_sections-${organizationId}`,
			storageKey: `v2-sidebar-sections-${organizationId}`,
			schema: dashboardSidebarSectionSchema,
			getKey: (item) => item.sectionId,
		}),
	);

	const v2TerminalPresets = createCollection(
		localStorageCollectionOptions({
			id: `v2_terminal_presets-${organizationId}`,
			storageKey: `v2-terminal-presets-${organizationId}`,
			schema: v2TerminalPresetSchema,
			getKey: (item) => item.id,
		}),
	);

	const pendingWorkspaces = createCollection(
		localStorageCollectionOptions({
			id: `pending_workspaces-${organizationId}`,
			storageKey: `pending-workspaces-${organizationId}`,
			schema: pendingWorkspaceSchema,
			getKey: (item) => item.id,
		}),
	);

	return {
		tasks,
		taskStatuses,
		projects,
		v2Hosts,
		v2Clients,
		v2UsersHosts,
		v2Projects,
		v2Workspaces,
		v2HostProjects,
		workspaces,
		members,
		users,
		invitations,
		agentCommands,
		integrationConnections,
		subscriptions,
		apiKeys,
		chatSessions,
		sessionHosts,
		githubRepositories,
		githubPullRequests,
		v2SidebarProjects,
		v2WorkspaceLocalState,
		v2SidebarSections,
		v2TerminalPresets,
		pendingWorkspaces,
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
	const collections = getCollections(organizationId);
	const collectionsToPreload = Object.entries(collections)
		.filter(([name]) => name !== "organizations")
		.map(([, collection]) => collection as Collection<object>);

	await Promise.allSettled(
		collectionsToPreload.map((c) => (c as Collection<object>).preload()),
	);
}

/**
 * Get collections for an organization, creating them if needed.
 * Collections are cached per org for instant switching.
 * Auth token is read dynamically via getAuthToken() - no need to pass it.
 */
export function getCollections(organizationId: string) {
	const cacheKey = getCollectionsCacheKey(organizationId);

	// Get or create org-specific collections
	if (!collectionsCache.has(cacheKey)) {
		collectionsCache.set(cacheKey, createOrgCollections(organizationId));
	}

	const orgCollections = collectionsCache.get(cacheKey);
	if (!orgCollections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return {
		...orgCollections,
		organizations: organizationsCollection,
	};
}

export type AppCollections = ReturnType<typeof getCollections>;
