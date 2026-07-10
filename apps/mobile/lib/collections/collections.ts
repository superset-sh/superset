import {
	FetchError,
	type ShapeStreamOptions,
	snakeCamelMapper,
} from "@electric-sql/client";
import type {
	SelectChatSession,
	SelectGithubPullRequest,
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectProject,
	SelectSubscription,
	SelectTask,
	SelectTaskStatus,
	SelectUser,
	SelectV2Host,
	SelectV2Project,
} from "@superset/db/schema";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { parseISO } from "date-fns";
import { authClient, getJwt, setJwt } from "../auth/client";
import { env } from "../env";
import { apiClient } from "../trpc/client";

const columnMapper = snakeCamelMapper();

// Hermes can't parse Postgres timestamp strings, so convert to Date during sync
const parser = {
	timestamp: (value: string) => parseISO(value),
	timestamptz: (value: string) => parseISO(value),
};
const electricUrl = `${env.EXPO_PUBLIC_ELECTRIC_URL}/v1/shape`;

const electricHeaders = {
	Authorization: () => {
		const token = getJwt();
		return token ? `Bearer ${token}` : "";
	},
};

type ElectricSyncErrorHandler = NonNullable<ShapeStreamOptions["onError"]>;

const handleElectricSyncError: ElectricSyncErrorHandler = async (error) => {
	if (error instanceof FetchError && error.status === 401) {
		try {
			const result = await authClient.token();
			if (result.data?.token) {
				setJwt(result.data.token);
			}
		} catch (refreshError) {
			console.error("[collections] JWT refresh after 401 failed", refreshError);
		}
		return {}; // retry once with the refreshed token
	}
	// 5xx/network/429 are retried inside Electric forever and never reach here, so
	// a 4xx that does is terminal — return void to stop the stream instead of
	// looping the same doomed request until Electric's 50-retry guard trips.
	console.error("[collections] Electric sync stopped", error);
	return;
};

interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
	v2Projects: Collection<SelectV2Project>;
	v2Hosts: Collection<SelectV2Host>;
	subscriptions: Collection<SelectSubscription>;
	chatSessions: Collection<SelectChatSession>;
	githubPullRequests: Collection<SelectGithubPullRequest>;
}

const collectionsCache = new Map<string, OrgCollections>();

// Organizations collection (global)
const organizationsCollection = createCollection(
	electricCollectionOptions<SelectOrganization>({
		id: "organizations",
		shapeOptions: {
			url: electricUrl,
			params: { table: "auth.organizations" },
			headers: electricHeaders,
			columnMapper,
			onError: handleElectricSyncError,
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
				params: { table: "tasks", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
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
				params: { table: "task_statuses", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const projects = createCollection(
		electricCollectionOptions<SelectProject>({
			id: `projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "projects", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const members = createCollection(
		electricCollectionOptions<SelectMember>({
			id: `members-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.members", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.users", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const invitations = createCollection(
		electricCollectionOptions<SelectInvitation>({
			id: `invitations-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.invitations", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Projects = createCollection(
		electricCollectionOptions<SelectV2Project>({
			id: `v2-projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "v2_projects", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Hosts = createCollection(
		electricCollectionOptions<SelectV2Host>({
			id: `v2-hosts-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "v2_hosts", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.machineId,
		}),
	);

	const subscriptions = createCollection(
		electricCollectionOptions<SelectSubscription>({
			id: `subscriptions-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "subscriptions", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const githubPullRequests = createCollection(
		electricCollectionOptions<SelectGithubPullRequest>({
			id: `github-pull-requests-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "github_pull_requests", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	const chatSessions = createCollection(
		electricCollectionOptions<SelectChatSession>({
			id: `chat-sessions-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "chat_sessions", organizationId },
				headers: electricHeaders,
				columnMapper,
				parser,
				onError: handleElectricSyncError,
			},
			getKey: (item) => item.id,
		}),
	);

	return {
		tasks,
		taskStatuses,
		projects,
		members,
		users,
		invitations,
		v2Projects,
		v2Hosts,
		subscriptions,
		chatSessions,
		githubPullRequests,
	};
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
