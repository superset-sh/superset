import type {
	SelectAgentCommand,
	SelectAutomation,
	SelectAutomationRun,
	SelectChatSession,
	SelectGithubPullRequest,
	SelectGithubRepository,
	SelectIntegrationConnection,
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectProject,
	SelectSubscription,
	SelectTask,
	SelectTaskStatus,
	SelectTeam,
	SelectTeamMember,
	SelectUser,
	SelectV2Client,
	SelectV2Host,
	SelectV2Project,
	SelectV2UsersHosts,
	SelectV2Workspace,
	SelectWorkspace,
} from "@superset/db/schema";
import type { AppRouter as HostServiceAppRouter } from "@superset/host-service";
import type { AppRouter } from "@superset/trpc";
import { BasicIndex } from "@tanstack/db";
import {
	createElectronSQLitePersistence,
	persistedCollectionOptions,
} from "@tanstack/electron-db-sqlite-persistence";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type {
	Collection,
	LocalStorageCollectionUtils,
} from "@tanstack/react-db";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { env } from "renderer/env.renderer";
import { getAuthToken } from "renderer/lib/auth-client";
import {
	getActiveLocalHostUrl,
	getActiveLocalMachineId,
	getHostServiceClientByUrl,
} from "renderer/lib/host-service-client";
import superjson from "superjson";
import { z } from "zod";
import {
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionRow,
	dashboardSidebarProjectSchema,
	dashboardSidebarSectionSchema,
	type FailedWorkspaceCreateRow,
	failedWorkspaceCreateSchema,
	healV2UserPreferences,
	healWorkspaceLocalState,
	type V2TerminalPresetRow,
	type V2UserPreferencesRow,
	v2TerminalPresetSchema,
	v2UserPreferencesSchema,
	type WorkspaceLocalStateRow,
	type WorkspacesCreateInput,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";
import { withReadHeal } from "./withReadHeal";

// How long workspaceSyncWaits waits for a delete to land in the collection.
export const WRITE_SYNC_TIMEOUT_MS = 30_000;

type HostWorkspacesCreateResult =
	inferRouterOutputs<HostServiceAppRouter>["workspaces"]["create"];

export interface WorkspaceCreateMutationMetadata {
	hostUrl: string;
	input: WorkspacesCreateInput;
	result?: HostWorkspacesCreateResult;
	[key: string]: unknown;
}

const persistence = createElectronSQLitePersistence({
	invoke: (channel, request) => window.ipcRenderer.invoke(channel, request),
});

const indexDefaults = {
	autoIndex: "eager",
	defaultIndexType: BasicIndex,
} as const;
const basicIndexConfig = { indexType: BasicIndex } as const;

const createIndexedCollection = ((
	config: Parameters<typeof createCollection>[0],
) =>
	createCollection({ ...config, ...indexDefaults })) as typeof createCollection;

// v2_workspaces is local-first: sourced from the local host-service, not Electric
// (plans/20260629-v2-workspaces-local-authoritative.md).
const queryClient = new QueryClient();
const LOCAL_WORKSPACES_POLL_MS = 3_000;
// All other org-scoped collections poll the tRPC `sync.pull` endpoint instead of
// Electric shapes. Freshness of changes made elsewhere is bounded by this.
const SYNC_POLL_INTERVAL_MS = 5_000;

type SyncTable = inferRouterInputs<AppRouter>["sync"]["pull"]["table"];

type QuerySyncConfig = ReturnType<typeof queryCollectionOptions>;
const createPersistedQueryCollection = ((config: QuerySyncConfig) => {
	const persisted = persistedCollectionOptions({
		...config,
		persistence,
		// Bumped from the Electric collection: the local SQLite cache rebuilds
		// cleanly when the sync source changes from shape to local query.
		schemaVersion: 2,
		// biome-ignore lint/suspicious/noExplicitAny: forces sync-wrapped overload
	} as any);
	return createCollection({
		...persisted,
		...indexDefaults,
		// biome-ignore lint/suspicious/noExplicitAny: persisted utils widen generics
	} as any);
}) as unknown as typeof createCollection;

// Workspaces for the renderer: this machine's from the local host-service
// (authoritative), merged with other machines' from cloud presence. Cloud is
// best-effort so the app still lists local workspaces offline.
async function fetchWorkspaces(
	organizationId: string,
): Promise<SelectV2Workspace[]> {
	const url = getActiveLocalHostUrl();
	// Throw (not []) while the host boots: a query-collection result is
	// authoritative full state, and [] would wipe the persisted rows. An error
	// keeps the previous snapshot until the next successful poll.
	if (!url) throw new Error("local host-service not ready");
	const client = getHostServiceClientByUrl(url);
	const localMachineId = getActiveLocalMachineId();

	const [local, cloud] = await Promise.all([
		client.workspace.localList.query() as Promise<SelectV2Workspace[]>,
		client.workspace.cloudList.query().catch(() => [] as unknown[]) as Promise<
			SelectV2Workspace[]
		>,
	]);

	// The host's SQLite holds every org's workspaces; this collection is per-org
	// (Electric used to apply this filter server-side).
	const localForOrg = local.filter((w) => w.organizationId === organizationId);
	// Local rows win; cloud only contributes other hosts' presence.
	const localIds = new Set(localForOrg.map((w) => w.id));
	const remote = cloud.filter(
		(w) =>
			w.organizationId === organizationId &&
			w.hostId !== localMachineId &&
			!localIds.has(w.id),
	);
	return [...localForOrg, ...remote];
}

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
	workspaces: Collection<SelectWorkspace>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
	teams: Collection<SelectTeam>;
	teamMembers: Collection<SelectTeamMember>;
	agentCommands: Collection<SelectAgentCommand>;
	integrationConnections: Collection<IntegrationConnectionDisplay>;
	subscriptions: Collection<SelectSubscription>;
	apiKeys: Collection<ApiKeyDisplay>;
	chatSessions: Collection<SelectChatSession>;
	githubRepositories: Collection<SelectGithubRepository>;
	githubPullRequests: Collection<SelectGithubPullRequest>;
	automations: Collection<SelectAutomation>;
	automationRuns: Collection<SelectAutomationRun>;
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
	v2UserPreferences: Collection<
		V2UserPreferencesRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2UserPreferencesSchema,
		z.input<typeof v2UserPreferencesSchema>
	>;
	failedWorkspaceCreates: Collection<
		FailedWorkspaceCreateRow,
		string,
		LocalStorageCollectionUtils,
		typeof failedWorkspaceCreateSchema,
		z.input<typeof failedWorkspaceCreateSchema>
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

// Pull an org-scoped table's rows from the API (org-scoping + column masking
// applied server-side in sync.pull), replacing the Electric shape.
function pull<T>(table: SyncTable, organizationId?: string): Promise<T[]> {
	return apiClient.sync.pull.query({
		table,
		organizationId,
	}) as unknown as Promise<T[]>;
}

const organizationsCollection = createPersistedQueryCollection(
	queryCollectionOptions<SelectOrganization>({
		id: "organizations",
		queryClient,
		queryKey: ["sync", "auth.organizations"],
		queryFn: () => pull<SelectOrganization>("auth.organizations"),
		refetchInterval: SYNC_POLL_INTERVAL_MS,
		getKey: (item) => item.id,
	}),
);

function createOrgCollections(organizationId: string): OrgCollections {
	const tasks = createPersistedQueryCollection(
		queryCollectionOptions<SelectTask>({
			id: `tasks-${organizationId}`,
			queryClient,
			queryKey: ["sync", "tasks", organizationId],
			queryFn: () => pull<SelectTask>("tasks", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				await apiClient.task.update.mutate({ ...changes, id: original.id });
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				await apiClient.task.delete.mutate(item.id);
			},
		}),
	);

	const taskStatuses = createPersistedQueryCollection(
		queryCollectionOptions<SelectTaskStatus>({
			id: `task_statuses-${organizationId}`,
			queryClient,
			queryKey: ["sync", "task_statuses", organizationId],
			queryFn: () => pull<SelectTaskStatus>("task_statuses", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const projects = createPersistedQueryCollection(
		queryCollectionOptions<SelectProject>({
			id: `projects-${organizationId}`,
			queryClient,
			queryKey: ["sync", "projects", organizationId],
			queryFn: () => pull<SelectProject>("projects", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const v2Projects = createPersistedQueryCollection(
		queryCollectionOptions<SelectV2Project>({
			id: `v2_projects-${organizationId}`,
			queryClient,
			queryKey: ["sync", "v2_projects", organizationId],
			queryFn: () => pull<SelectV2Project>("v2_projects", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const githubRepositoryId =
					changes.githubRepositoryId === null &&
					changes.repoCloneUrl !== undefined
						? undefined
						: changes.githubRepositoryId;
				await apiClient.v2Project.update.mutate({
					id: original.id,
					name: changes.name,
					slug: changes.slug,
					repoCloneUrl: changes.repoCloneUrl,
					githubRepositoryId,
				});
			},
		}),
	);
	v2Projects.createIndex(
		(project) => project.githubRepositoryId,
		basicIndexConfig,
	);

	const v2Hosts = createPersistedQueryCollection(
		queryCollectionOptions<SelectV2Host>({
			id: `v2_hosts-${organizationId}`,
			queryClient,
			queryKey: ["sync", "v2_hosts", organizationId],
			queryFn: () => pull<SelectV2Host>("v2_hosts", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			// Composite PK on (organization_id, machine_id); within an
			// org-scoped collection, machineId alone is unique.
			getKey: (item) => item.machineId,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				if (changes.name === undefined) {
					throw new Error("Only name updates are supported on v2_hosts");
				}
				await apiClient.v2Host.rename.mutate({
					hostId: original.machineId,
					name: changes.name,
				});
			},
		}),
	);
	v2Hosts.createIndex((host) => host.machineId, basicIndexConfig);

	const v2Clients = createPersistedQueryCollection(
		queryCollectionOptions<SelectV2Client>({
			id: `v2_clients-${organizationId}`,
			queryClient,
			queryKey: ["sync", "v2_clients", organizationId],
			queryFn: () => pull<SelectV2Client>("v2_clients", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			// Composite PK on (organization_id, user_id, machine_id); within
			// an org-scoped collection, (user_id, machine_id) is unique.
			getKey: (item) => `${item.userId}:${item.machineId}`,
		}),
	);

	const v2UsersHosts = createPersistedQueryCollection(
		queryCollectionOptions<SelectV2UsersHosts>({
			id: `v2_users_hosts-${organizationId}`,
			queryClient,
			queryKey: ["sync", "v2_users_hosts", organizationId],
			queryFn: () => pull<SelectV2UsersHosts>("v2_users_hosts", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => `${item.userId}:${item.hostId}`,
			onInsert: async ({ transaction }) => {
				const item = transaction.mutations[0].modified;
				await apiClient.v2Host.addMember.mutate({
					hostId: item.hostId,
					userId: item.userId,
					role: item.role,
				});
			},
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				if (changes.role === undefined) {
					throw new Error("Only role updates are supported on v2_users_hosts");
				}
				await apiClient.v2Host.setMemberRole.mutate({
					hostId: original.hostId,
					userId: original.userId,
					role: changes.role,
				});
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				await apiClient.v2Host.removeMember.mutate({
					hostId: item.hostId,
					userId: item.userId,
				});
			},
		}),
	);
	v2UsersHosts.createIndex((userHost) => userHost.hostId, basicIndexConfig);
	v2UsersHosts.createIndex((userHost) => userHost.userId, basicIndexConfig);

	const v2Workspaces = createPersistedQueryCollection(
		queryCollectionOptions<SelectV2Workspace>({
			id: `v2_workspaces-${organizationId}`,
			queryClient,
			queryKey: ["local-workspaces", organizationId],
			queryFn: () => fetchWorkspaces(organizationId),
			refetchInterval: LOCAL_WORKSPACES_POLL_MS,
			getKey: (item) => item.id,
			onInsert: async ({ transaction }) => {
				const metadata = transaction.mutations[0]
					.metadata as WorkspaceCreateMutationMetadata;
				const client = getHostServiceClientByUrl(metadata.hostUrl);
				metadata.result = await client.workspaces.create.mutate(metadata.input);
			},
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const { branch, hostId, name, taskId } = changes;
				// Persist to the local row (source of truth) so the next poll keeps
				// the change, then mirror to cloud presence. Remote hosts' workspaces
				// have no local row; for those the cloud update is authoritative.
				const localUrl = getActiveLocalHostUrl();
				const isLocalWorkspace = original.hostId === getActiveLocalMachineId();
				if (
					localUrl &&
					isLocalWorkspace &&
					(name !== undefined || taskId !== undefined || branch !== undefined)
				) {
					await getHostServiceClientByUrl(
						localUrl,
					).workspace.updateLocal.mutate({
						id: original.id,
						name,
						taskId,
						branch,
					});
				}
				await apiClient.v2Workspace.update.mutate({
					id: original.id,
					branch,
					hostId,
					name,
					taskId,
				});
			},
		}),
	);
	v2Workspaces.createIndex((workspace) => workspace.hostId, basicIndexConfig);
	v2Workspaces.createIndex(
		(workspace) => workspace.projectId,
		basicIndexConfig,
	);
	v2Workspaces.createIndex((workspace) => workspace.type, basicIndexConfig);

	const workspaces = createPersistedQueryCollection(
		queryCollectionOptions<SelectWorkspace>({
			id: `workspaces-${organizationId}`,
			queryClient,
			queryKey: ["sync", "workspaces", organizationId],
			queryFn: () => pull<SelectWorkspace>("workspaces", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const members = createPersistedQueryCollection(
		queryCollectionOptions<SelectMember>({
			id: `members-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.members", organizationId],
			queryFn: () => pull<SelectMember>("auth.members", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const users = createPersistedQueryCollection(
		queryCollectionOptions<SelectUser>({
			id: `users-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.users", organizationId],
			queryFn: () => pull<SelectUser>("auth.users", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const invitations = createPersistedQueryCollection(
		queryCollectionOptions<SelectInvitation>({
			id: `invitations-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.invitations", organizationId],
			queryFn: () => pull<SelectInvitation>("auth.invitations", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const teams = createPersistedQueryCollection(
		queryCollectionOptions<SelectTeam>({
			id: `teams-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.teams", organizationId],
			queryFn: () => pull<SelectTeam>("auth.teams", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const teamMembers = createPersistedQueryCollection(
		queryCollectionOptions<SelectTeamMember>({
			id: `team-members-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.team_members", organizationId],
			queryFn: () =>
				pull<SelectTeamMember>("auth.team_members", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const agentCommands = createPersistedQueryCollection(
		queryCollectionOptions<SelectAgentCommand>({
			id: `agent_commands-${organizationId}`,
			queryClient,
			queryKey: ["sync", "agent_commands", organizationId],
			queryFn: () => pull<SelectAgentCommand>("agent_commands", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				await apiClient.agent.updateCommand.mutate({
					...changes,
					id: original.id,
				});
			},
		}),
	);

	const integrationConnections = createPersistedQueryCollection(
		queryCollectionOptions<IntegrationConnectionDisplay>({
			id: `integration_connections-${organizationId}`,
			queryClient,
			queryKey: ["sync", "integration_connections", organizationId],
			queryFn: () =>
				pull<IntegrationConnectionDisplay>(
					"integration_connections",
					organizationId,
				),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const subscriptions = createPersistedQueryCollection(
		queryCollectionOptions<SelectSubscription>({
			id: `subscriptions-${organizationId}`,
			queryClient,
			queryKey: ["sync", "subscriptions", organizationId],
			queryFn: () => pull<SelectSubscription>("subscriptions", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const apiKeys = createPersistedQueryCollection(
		queryCollectionOptions<ApiKeyDisplay>({
			id: `apikeys-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.apikeys", organizationId],
			queryFn: () => pull<ApiKeyDisplay>("auth.apikeys", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const chatSessions = createPersistedQueryCollection(
		queryCollectionOptions<SelectChatSession>({
			id: `chat_sessions-${organizationId}`,
			queryClient,
			queryKey: ["sync", "chat_sessions", organizationId],
			queryFn: () => pull<SelectChatSession>("chat_sessions", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.chat.deleteSession.mutate({
					sessionId: item.id,
				});
				if (!result.deleted) {
					throw new Error("Chat session was not deleted");
				}
			},
		}),
	);

	const githubRepositories = createPersistedQueryCollection(
		queryCollectionOptions<SelectGithubRepository>({
			id: `github_repositories-${organizationId}`,
			queryClient,
			queryKey: ["sync", "github_repositories", organizationId],
			queryFn: () =>
				pull<SelectGithubRepository>("github_repositories", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const githubPullRequests = createPersistedQueryCollection(
		queryCollectionOptions<SelectGithubPullRequest>({
			id: `github_pull_requests-${organizationId}`,
			queryClient,
			queryKey: ["sync", "github_pull_requests", organizationId],
			queryFn: () =>
				pull<SelectGithubPullRequest>("github_pull_requests", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const automations = createPersistedQueryCollection(
		queryCollectionOptions<SelectAutomation>({
			id: `automations-${organizationId}`,
			queryClient,
			queryKey: ["sync", "automations", organizationId],
			queryFn: () => pull<SelectAutomation>("automations", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const automationRuns = createPersistedQueryCollection(
		queryCollectionOptions<SelectAutomationRun>({
			id: `automation_runs-${organizationId}`,
			queryClient,
			queryKey: ["sync", "automation_runs", organizationId],
			queryFn: () =>
				pull<SelectAutomationRun>("automation_runs", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const v2SidebarProjects = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_projects-${organizationId}`,
			storageKey: `v2-sidebar-projects-${organizationId}`,
			schema: dashboardSidebarProjectSchema,
			getKey: (item) => item.projectId,
		}),
	);
	v2SidebarProjects.createIndex(
		(sidebarProject) => sidebarProject.tabOrder,
		basicIndexConfig,
	);

	const v2WorkspaceLocalState = createIndexedCollection(
		localStorageCollectionOptions(
			withReadHeal(
				{
					id: `v2_workspace_local_state-${organizationId}`,
					storageKey: `v2-workspace-local-state-${organizationId}`,
					schema: workspaceLocalStateSchema,
					// Explicit type so `withReadHeal`'s passthrough generic keeps the
					// linkage between schema and getKey for downstream inference.
					getKey: (item: WorkspaceLocalStateRow) => item.workspaceId,
				},
				healWorkspaceLocalState,
			),
		),
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.projectId,
		basicIndexConfig,
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.sectionId,
		basicIndexConfig,
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.tabOrder,
		basicIndexConfig,
	);

	const v2SidebarSections = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_sections-${organizationId}`,
			storageKey: `v2-sidebar-sections-${organizationId}`,
			schema: dashboardSidebarSectionSchema,
			getKey: (item) => item.sectionId,
		}),
	);
	v2SidebarSections.createIndex(
		(section) => section.projectId,
		basicIndexConfig,
	);
	v2SidebarSections.createIndex(
		(section) => section.tabOrder,
		basicIndexConfig,
	);

	const v2TerminalPresets = createIndexedCollection(
		localStorageCollectionOptions({
			id: `v2_terminal_presets-${organizationId}`,
			storageKey: `v2-terminal-presets-${organizationId}`,
			schema: v2TerminalPresetSchema,
			getKey: (item) => item.id,
		}),
	);

	const v2UserPreferences = createCollection(
		localStorageCollectionOptions(
			withReadHeal(
				{
					id: `v2_user_preferences-${organizationId}`,
					storageKey: `v2-user-preferences-${organizationId}`,
					schema: v2UserPreferencesSchema,
					// Cast widens the inferred literal "preferences" key to string so
					// the collection slots into the shared OrgCollections.{...<TKey=string>}
					// shape alongside the other v2 collections. Explicit `item` type so
					// `withReadHeal`'s passthrough generic keeps schema/getKey linkage.
					getKey: (item: V2UserPreferencesRow) => item.id as string,
				},
				healV2UserPreferences,
			),
		),
	);

	const failedWorkspaceCreates = createIndexedCollection(
		localStorageCollectionOptions({
			id: `failed_workspace_creates-${organizationId}`,
			storageKey: `failed-workspace-creates-${organizationId}`,
			schema: failedWorkspaceCreateSchema,
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
		workspaces,
		members,
		users,
		invitations,
		teams,
		teamMembers,
		agentCommands,
		integrationConnections,
		subscriptions,
		apiKeys,
		chatSessions,
		githubRepositories,
		githubPullRequests,
		automations,
		automationRuns,
		v2SidebarProjects,
		v2WorkspaceLocalState,
		v2SidebarSections,
		v2TerminalPresets,
		v2UserPreferences,
		failedWorkspaceCreates,
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
