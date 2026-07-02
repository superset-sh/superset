import type {
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectProject,
	SelectTask,
	SelectTaskStatus,
	SelectUser,
} from "@superset/db/schema";
import type { RouterInputs } from "@superset/trpc";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../trpc/client";

// Poll the tRPC sync.pull endpoint instead of Electric shapes. Optimistic
// writes still update the UI instantly; this interval bounds how quickly changes
// made elsewhere appear.
const SYNC_POLL_INTERVAL_MS = 5_000;

type SyncTable = RouterInputs["sync"]["pull"]["table"];

const queryClient = new QueryClient();

function pull<T>(table: SyncTable, organizationId?: string): Promise<T[]> {
	return apiClient.sync.pull.query({
		table,
		organizationId,
	}) as unknown as Promise<T[]>;
}

interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
}

const collectionsCache = new Map<string, OrgCollections>();

const organizationsCollection = createCollection(
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
	const tasks = createCollection(
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

	const taskStatuses = createCollection(
		queryCollectionOptions<SelectTaskStatus>({
			id: `task_statuses-${organizationId}`,
			queryClient,
			queryKey: ["sync", "task_statuses", organizationId],
			queryFn: () => pull<SelectTaskStatus>("task_statuses", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const projects = createCollection(
		queryCollectionOptions<SelectProject>({
			id: `projects-${organizationId}`,
			queryClient,
			queryKey: ["sync", "projects", organizationId],
			queryFn: () => pull<SelectProject>("projects", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const members = createCollection(
		queryCollectionOptions<SelectMember>({
			id: `members-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.members", organizationId],
			queryFn: () => pull<SelectMember>("auth.members", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const users = createCollection(
		queryCollectionOptions<SelectUser>({
			id: `users-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.users", organizationId],
			queryFn: () => pull<SelectUser>("auth.users", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	const invitations = createCollection(
		queryCollectionOptions<SelectInvitation>({
			id: `invitations-${organizationId}`,
			queryClient,
			queryKey: ["sync", "auth.invitations", organizationId],
			queryFn: () => pull<SelectInvitation>("auth.invitations", organizationId),
			refetchInterval: SYNC_POLL_INTERVAL_MS,
			getKey: (item) => item.id,
		}),
	);

	return { tasks, taskStatuses, projects, members, users, invitations };
}

export function getCollections(organizationId: string) {
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
