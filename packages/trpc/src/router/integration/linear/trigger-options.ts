import type { LinearClient } from "@linear/sdk";
import type { TriggerOption, TriggerOptionSource } from "../trigger-options";
import { callLinear } from "./refresh";

type Named = { id: string; name: string };
type TeamScoped = Named & { team: { key: string } | null };
type Member = { id: string; name: string; displayName: string | null };
type Page<T> = {
	nodes: T[];
	pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const PAGE_INFO = "pageInfo { hasNextPage endCursor }";
const CONNECTIONS = {
	teams: `teams(first: 250, after: $after) { nodes { id name } ${PAGE_INFO} }`,
	projects: `projects(first: 250, after: $after) { nodes { id name } ${PAGE_INFO} }`,
	issueLabels: `issueLabels(first: 250, after: $after) { nodes { id name team { key } } ${PAGE_INFO} }`,
	workflowStates: `workflowStates(first: 250, after: $after) { nodes { id name team { key } } ${PAGE_INFO} }`,
	users: `users(first: 250, after: $after, filter: { active: { eq: true } }) { nodes { id name displayName } ${PAGE_INFO} }`,
} as const;
type ConnectionName = keyof typeof CONNECTIONS;
type TriggerOptionsQuery = {
	teams: Page<Named>;
	projects: Page<Named>;
	issueLabels: Page<TeamScoped>;
	workflowStates: Page<TeamScoped>;
	users: Page<Member>;
};

// A workspace can outgrow one page (250, Linear's cap) of labels, states or
// members. The common case is still one round trip: only a connection that
// reports more pages is followed, on its own. Bounded so a misbehaving API
// cannot keep the request open forever.
const MAX_PAGES = 20;

async function fetchAllTriggerOptions(
	client: LinearClient,
): Promise<TriggerOptionsQuery> {
	const query = (names: ConnectionName[]) =>
		`query TriggerOptions($after: String) { ${names
			.map((n) => CONNECTIONS[n])
			.join(" ")} }`;
	const request = (names: ConnectionName[], after: string | null) =>
		client.client.request<
			Partial<TriggerOptionsQuery>,
			{ after: string | null }
		>(query(names), { after });

	const names = Object.keys(CONNECTIONS) as ConnectionName[];
	const result = (await request(names, null)) as TriggerOptionsQuery;
	for (const name of names) {
		const all: Array<Named | TeamScoped | Member> = result[name].nodes;
		let { pageInfo } = result[name];
		for (let i = 1; i < MAX_PAGES && pageInfo.hasNextPage; i++) {
			const next = (await request([name], pageInfo.endCursor))[name];
			if (!next) break;
			all.push(...next.nodes);
			pageInfo = next.pageInfo;
		}
	}
	return result;
}

/**
 * The editor asks for every Linear list at once, and each source below picks
 * one of them. One Linear round trip serves them all: concurrent sources for
 * the same organization share the in-flight request rather than each
 * resolving the client (and racing a token refresh) on their own.
 */
const inFlight = new Map<string, Promise<TriggerOptionsQuery | null>>();

function triggerOptionsFor(organizationId: string) {
	let pending = inFlight.get(organizationId);
	if (!pending) {
		pending = callLinear(organizationId, fetchAllTriggerOptions).finally(() =>
			inFlight.delete(organizationId),
		);
		inFlight.set(organizationId, pending);
	}
	return pending;
}

// Workflow states and labels repeat their names across teams, so the team
// key is part of the label rather than a separate column.
const withTeam = (name: string, team: { key: string } | null) =>
	team ? `${name} · ${team.key}` : name;
const byLabel = (options: TriggerOption[]) =>
	options.sort((a, b) => a.label.localeCompare(b.label));

/**
 * Everything a Linear trigger sentence can pick from. Ids throughout: a team
 * key or state name can be renamed, the id cannot. People are keyed by
 * Linear user id — what a webhook's `assigneeId` and actor id carry.
 */
function source(
	pick: (result: TriggerOptionsQuery) => TriggerOption[],
): TriggerOptionSource {
	return async ({ organizationId }) => {
		const result = await triggerOptionsFor(organizationId);
		return result ? byLabel(pick(result)) : [];
	};
}

export const linearTriggerOptions = {
	teams: source((r) => r.teams.nodes.map((t) => ({ id: t.id, label: t.name }))),
	projects: source((r) =>
		r.projects.nodes.map((p) => ({ id: p.id, label: p.name })),
	),
	labels: source((r) =>
		r.issueLabels.nodes.map((l) => ({
			id: l.id,
			label: withTeam(l.name, l.team),
		})),
	),
	statuses: source((r) =>
		r.workflowStates.nodes.map((s) => ({
			id: s.id,
			label: withTeam(s.name, s.team),
		})),
	),
	people: source((r) =>
		r.users.nodes.map((u) => ({ id: u.id, label: u.displayName || u.name })),
	),
};
