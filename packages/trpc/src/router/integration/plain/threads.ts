import type { PlainClient } from "./client";

type Priority = "urgent" | "high" | "medium" | "low" | "none";

/** Plain priorities are integers: 0 = urgent, 1 = high, 2 = normal, 3 = low. */
export function mapPriorityFromPlain(plainPriority: number): Priority {
	switch (plainPriority) {
		case 0:
			return "urgent";
		case 1:
			return "high";
		case 2:
			return "medium";
		case 3:
			return "low";
		default:
			return "none";
	}
}

/** Plain's DateTime scalar is an object, not an ISO string. */
export interface PlainDateTime {
	iso8601: string;
}

export type PlainThreadStatus =
	| "TODO"
	| "SNOOZED"
	| "DONE"
	| "UNKNOWN_THREAD_STATUS";

export type PlainThreadAssignee =
	| {
			__typename: "User";
			id: string;
			fullName: string;
			email: string;
			avatarUrl: string | null;
	  }
	| { __typename: "MachineUser"; id: string; fullName: string }
	| { __typename: "System" };

export interface PlainThread {
	id: string;
	ref: string;
	title: string;
	description: string | null;
	previewText: string | null;
	priority: number;
	status: PlainThreadStatus;
	statusChangedAt: PlainDateTime;
	customer: {
		id: string;
		fullName: string;
		avatarUrl: string | null;
		email: { email: string };
	};
	assignedTo: PlainThreadAssignee | null;
	labels: Array<{ id: string; labelType: { id: string; name: string } }>;
	createdAt: PlainDateTime;
	updatedAt: PlainDateTime;
}

const THREAD_FRAGMENT = `
  fragment ThreadFields on Thread {
    id
    ref
    title
    description
    previewText
    priority
    status
    statusChangedAt {
      iso8601
    }
    customer {
      id
      fullName
      avatarUrl
      email {
        email
      }
    }
    assignedTo {
      __typename
      ... on User {
        id
        fullName
        email
        avatarUrl
      }
      ... on MachineUser {
        id
        fullName
      }
    }
    labels {
      id
      labelType {
        id
        name
      }
    }
    createdAt {
      iso8601
    }
    updatedAt {
      iso8601
    }
  }
`;

const THREADS_QUERY = `
  query Threads($first: Int!, $after: String, $filters: ThreadsFilter) {
    threads(first: $first, after: $after, filters: $filters) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...ThreadFields
        }
      }
    }
  }
  ${THREAD_FRAGMENT}
`;

const THREAD_QUERY = `
  query Thread($threadId: ID!) {
    thread(threadId: $threadId) {
      ...ThreadFields
    }
  }
  ${THREAD_FRAGMENT}
`;

export const MY_WORKSPACE_QUERY = `
  query MyWorkspace {
    myWorkspace {
      id
      name
    }
  }
`;

export interface MyWorkspaceResponse {
	myWorkspace: { id: string; name: string } | null;
}

interface ThreadsQueryResponse {
	threads: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		edges: Array<{ node: PlainThread }>;
	};
}

interface ThreadQueryResponse {
	thread: PlainThread | null;
}

const PAGE_SIZE = 100;
// Bounds one backfill invocation; anything beyond stays in Plain until the
// webhook (or a reconnect) picks it up.
const MAX_PAGES = 50;
const BACKFILL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export async function fetchAllThreads(
	client: PlainClient,
): Promise<PlainThread[]> {
	const allThreads: PlainThread[] = [];
	let cursor: string | undefined;
	let pages = 0;
	const threeMonthsAgo = new Date(Date.now() - BACKFILL_WINDOW_MS);

	do {
		const response = await client.request<
			ThreadsQueryResponse,
			{ first: number; after?: string; filters: object }
		>(THREADS_QUERY, {
			first: PAGE_SIZE,
			after: cursor,
			filters: { updatedAt: { after: threeMonthsAgo.toISOString() } },
		});
		allThreads.push(...response.threads.edges.map((edge) => edge.node));
		pages += 1;
		cursor =
			response.threads.pageInfo.hasNextPage &&
			response.threads.pageInfo.endCursor
				? response.threads.pageInfo.endCursor
				: undefined;
		if (cursor && pages >= MAX_PAGES) {
			console.warn(
				`[plain] Backfill hit the ${MAX_PAGES * PAGE_SIZE}-thread cap; older threads sync via webhooks`,
			);
			cursor = undefined;
		}
	} while (cursor);

	return allThreads;
}

export async function fetchThread(
	client: PlainClient,
	threadId: string,
): Promise<PlainThread | null> {
	const response = await client.request<
		ThreadQueryResponse,
		{ threadId: string }
	>(THREAD_QUERY, { threadId });
	return response.thread;
}

/**
 * `tasks` slugs are unique per org across all providers, and Plain refs
 * ("T-1234") could collide with a Linear team keyed "T". Namespace them;
 * the untouched ref stays in `externalKey`.
 */
export function plainSlugFromRef(ref: string): string {
	return `PL-${ref.replace(/^T-/, "")}`;
}

function buildDescription(thread: PlainThread): string {
	const customerLine = `Customer: ${thread.customer.fullName} <${thread.customer.email.email}>`;
	const body = thread.description ?? thread.previewText;
	return body ? `${customerLine}\n\n${body}` : customerLine;
}

export function mapThreadToTask(
	thread: PlainThread,
	organizationId: string,
	creatorId: string,
	userByEmail: Map<string, string>,
	statusByExternalId: Map<string, string>,
) {
	const assignee = thread.assignedTo;
	const assigneeEmail = assignee?.__typename === "User" ? assignee.email : null;
	const assigneeId = assigneeEmail
		? (userByEmail.get(assigneeEmail) ?? null)
		: null;

	let assigneeExternalId: string | null = null;
	let assigneeDisplayName: string | null = null;
	let assigneeAvatarUrl: string | null = null;

	if (assignee && assignee.__typename !== "System" && !assigneeId) {
		assigneeExternalId = assignee.id;
		assigneeDisplayName = assignee.fullName;
		assigneeAvatarUrl =
			assignee.__typename === "User" ? assignee.avatarUrl : null;
	}

	// UNKNOWN_THREAD_STATUS is Plain's forward-compat fallback; treat it as Todo
	// so a schema addition on their side doesn't drop threads from the sync.
	const statusId =
		statusByExternalId.get(thread.status) ?? statusByExternalId.get("TODO");
	if (!statusId) {
		console.warn(
			`[plain] Status not found for thread status ${thread.status}, skipping thread ${thread.ref}`,
		);
		return null;
	}

	return {
		organizationId,
		creatorId,
		slug: plainSlugFromRef(thread.ref),
		title: thread.title,
		description: buildDescription(thread),
		statusId,
		priority: mapPriorityFromPlain(thread.priority),
		assigneeId,
		assigneeExternalId,
		assigneeDisplayName,
		assigneeAvatarUrl,
		labels: thread.labels.map((label) => label.labelType.name),
		completedAt:
			thread.status === "DONE"
				? new Date(thread.statusChangedAt.iso8601)
				: null,
		createdAt: new Date(thread.createdAt.iso8601),
		externalProvider: "plain" as const,
		externalId: thread.id,
		externalKey: thread.ref,
		lastSyncedAt: new Date(),
	};
}
