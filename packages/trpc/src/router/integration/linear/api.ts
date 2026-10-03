import type { LinearClient } from "@linear/sdk";
import type { TaskPriority } from "@superset/db/enums";

export function mapPriorityToLinear(priority: TaskPriority): number {
	switch (priority) {
		case "urgent":
			return 1;
		case "high":
			return 2;
		case "medium":
			return 3;
		case "low":
			return 4;
		default:
			return 0;
	}
}

export function mapPriorityFromLinear(linearPriority: number): TaskPriority {
	switch (linearPriority) {
		case 1:
			return "urgent";
		case 2:
			return "high";
		case 3:
			return "medium";
		case 4:
			return "low";
		default:
			return "none";
	}
}

export type LinearStateType =
	| "triage"
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

export interface LinearUser {
	id: string;
	name: string;
	displayName: string;
	email: string | null;
	avatarUrl: string | null;
}

export interface LinearState {
	id: string;
	name: string;
	type: LinearStateType;
	color: string;
	position: number;
}

export interface LinearTeam {
	id: string;
	key: string;
	name: string;
}

export interface LinearLabel {
	id: string;
	name: string;
	color: string;
}

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	url: string;
	branchName: string;
	priority: TaskPriority;
	createdAt: string;
	updatedAt: string;
	state: LinearState;
	assignee: LinearUser | null;
	team: LinearTeam;
	project: { id: string; name: string } | null;
	labels: LinearLabel[];
}

export interface LinearIssueDetail extends LinearIssue {
	description: string | null;
}

export interface LinearIssuePage {
	issues: LinearIssue[];
	nextCursor: string | null;
}

export interface LinearWorkspace {
	teams: Array<LinearTeam & { states: LinearState[] }>;
	users: LinearUser[];
}

export interface LinearIssueFilter {
	team?: { id: { eq: string } };
	state?: { type: { in: LinearStateType[] } };
	assignee?: { null: true } | { id: { eq: string } } | { isMe: { eq: true } };
}

const STATE_TYPE_ORDER: LinearStateType[] = [
	"triage",
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
];

// Linear bills each nested object and multiplies connections by their page
// size, so every list here is bounded explicitly.
export const ISSUE_PAGE_SIZE = 50;

const USER_FIELDS = "id name displayName email avatarUrl";
const STATE_FIELDS = "id name type color position";
const ISSUE_FIELDS = `
	id identifier title url branchName priority createdAt updatedAt
	state { ${STATE_FIELDS} }
	assignee { ${USER_FIELDS} }
	team { id key name }
	project { id name }
	labels(first: 10) { nodes { id name color } }
`;

type RawIssue = Omit<LinearIssue, "labels" | "priority"> & {
	priority: number;
	labels: { nodes: LinearLabel[] };
};
type RawIssueDetail = RawIssue & { description: string | null };

interface RawConnection<T> {
	nodes: T[];
	pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

function toIssue<T extends RawIssue>(
	raw: T,
): Omit<T, "labels" | "priority"> & {
	labels: LinearLabel[];
	priority: TaskPriority;
} {
	return {
		...raw,
		priority: mapPriorityFromLinear(raw.priority),
		labels: raw.labels.nodes,
	};
}

function toPage(connection: RawConnection<RawIssue>): LinearIssuePage {
	return {
		issues: connection.nodes.map(toIssue),
		nextCursor: connection.pageInfo.hasNextPage
			? connection.pageInfo.endCursor
			: null,
	};
}

async function request<T>(
	client: LinearClient,
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const response = await client.client.rawRequest<T, Record<string, unknown>>(
		query,
		variables,
	);
	if (!response.data) {
		throw new Error("Linear returned no data");
	}
	return response.data;
}

export async function listIssues(
	client: LinearClient,
	input: { filter: LinearIssueFilter; cursor?: string; search?: string },
): Promise<LinearIssuePage> {
	const variables = {
		filter: input.filter,
		first: ISSUE_PAGE_SIZE,
		after: input.cursor ?? null,
	};
	if (input.search) {
		const data = await request<{ searchIssues: RawConnection<RawIssue> }>(
			client,
			`query SupersetSearchIssues($term: String!, $filter: IssueFilter, $first: Int!, $after: String) {
				searchIssues(term: $term, filter: $filter, first: $first, after: $after) {
					nodes { ${ISSUE_FIELDS} }
					pageInfo { hasNextPage endCursor }
				}
			}`,
			{ ...variables, term: input.search },
		);
		return toPage(data.searchIssues);
	}
	const data = await request<{ issues: RawConnection<RawIssue> }>(
		client,
		`query SupersetIssues($filter: IssueFilter, $first: Int!, $after: String) {
			issues(filter: $filter, first: $first, after: $after, orderBy: updatedAt) {
				nodes { ${ISSUE_FIELDS} }
				pageInfo { hasNextPage endCursor }
			}
		}`,
		variables,
	);
	return toPage(data.issues);
}

export async function getIssue(
	client: LinearClient,
	idOrIdentifier: string,
): Promise<LinearIssueDetail> {
	const data = await request<{ issue: RawIssueDetail }>(
		client,
		`query SupersetIssue($id: String!) {
			issue(id: $id) { ${ISSUE_FIELDS} description }
		}`,
		{ id: idOrIdentifier },
	);
	return toIssue(data.issue);
}

export async function updateIssue(
	client: LinearClient,
	id: string,
	input: {
		stateId?: string;
		priority?: TaskPriority;
		assigneeId?: string | null;
	},
): Promise<LinearIssueDetail> {
	const data = await request<{
		issueUpdate: { success: boolean; issue: RawIssueDetail | null };
	}>(
		client,
		`mutation SupersetIssueUpdate($id: String!, $input: IssueUpdateInput!) {
			issueUpdate(id: $id, input: $input) {
				success
				issue { ${ISSUE_FIELDS} description }
			}
		}`,
		{
			id,
			input: {
				...input,
				priority:
					input.priority === undefined
						? undefined
						: mapPriorityToLinear(input.priority),
			},
		},
	);
	if (!data.issueUpdate.success || !data.issueUpdate.issue) {
		throw new Error("Linear did not update the issue");
	}
	return toIssue(data.issueUpdate.issue);
}

export async function createIssue(
	client: LinearClient,
	input: {
		teamId: string;
		title: string;
		description?: string;
		stateId?: string;
		priority?: TaskPriority;
		assigneeId?: string;
	},
): Promise<LinearIssueDetail> {
	const data = await request<{
		issueCreate: { success: boolean; issue: RawIssueDetail | null };
	}>(
		client,
		`mutation SupersetIssueCreate($input: IssueCreateInput!) {
			issueCreate(input: $input) {
				success
				issue { ${ISSUE_FIELDS} description }
			}
		}`,
		{
			input: {
				...input,
				priority:
					input.priority === undefined
						? undefined
						: mapPriorityToLinear(input.priority),
			},
		},
	);
	if (!data.issueCreate.success || !data.issueCreate.issue) {
		throw new Error("Linear did not create the issue");
	}
	return toIssue(data.issueCreate.issue);
}

export async function getWorkspace(
	client: LinearClient,
): Promise<LinearWorkspace> {
	const data = await request<{
		teams: {
			nodes: Array<LinearTeam & { states: { nodes: LinearState[] } }>;
		};
		users: { nodes: LinearUser[] };
	}>(
		client,
		`query SupersetLinearWorkspace {
			teams(first: 50) {
				nodes { id key name states(first: 50) { nodes { ${STATE_FIELDS} } } }
			}
			users(first: 250, filter: { active: { eq: true } }) {
				nodes { ${USER_FIELDS} }
			}
		}`,
		{},
	);
	return {
		teams: data.teams.nodes
			.map((team) => ({
				...team,
				states: [...team.states.nodes].sort(
					(a, b) =>
						STATE_TYPE_ORDER.indexOf(a.type) -
							STATE_TYPE_ORDER.indexOf(b.type) || a.position - b.position,
				),
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		users: [...data.users.nodes].sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		),
	};
}

export function isLinearRateLimitError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as {
		type?: string;
		errors?: Array<{ extensions?: { code?: string } }>;
	};
	return (
		candidate.type === "Ratelimited" ||
		(candidate.errors?.some(
			(item) => item.extensions?.code === "RATELIMITED",
		) ??
			false)
	);
}

export const linearStatusFilterValues = [
	"all",
	"active",
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
] as const;
export type LinearStatusFilter = (typeof linearStatusFilterValues)[number];

const STATE_TYPES_BY_FILTER: Record<
	Exclude<LinearStatusFilter, "all">,
	LinearStateType[]
> = {
	active: ["unstarted", "started"],
	backlog: ["triage", "backlog"],
	unstarted: ["unstarted"],
	started: ["started"],
	completed: ["completed"],
	canceled: ["canceled"],
};

export function issueFilterFor(input: {
	teamId?: string | null;
	status: LinearStatusFilter;
	assignee?: string | null;
}): LinearIssueFilter {
	const filter: LinearIssueFilter = {};
	if (input.teamId) filter.team = { id: { eq: input.teamId } };
	if (input.status !== "all") {
		filter.state = { type: { in: STATE_TYPES_BY_FILTER[input.status] } };
	}
	if (input.assignee === "me") filter.assignee = { isMe: { eq: true } };
	else if (input.assignee === "unassigned") filter.assignee = { null: true };
	else if (input.assignee) filter.assignee = { id: { eq: input.assignee } };
	return filter;
}
