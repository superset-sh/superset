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

interface Team {
	id: string;
	key: string;
	name: string;
	states: Array<{ id: string; name: string }>;
}

interface Workspace {
	teams: Team[];
	users: Array<{ id: string; email: string | null }>;
}

export class LinearLookupError extends Error {
	constructor(
		message: string,
		readonly hint: string,
	) {
		super(message);
	}
}

/**
 * By key or id, then by name; the only team when there is one. `option` names
 * the caller's team input in the error, e.g. `--team`.
 */
export function findLinearTeam<T extends Team>(
	workspace: { teams: T[] },
	value: string | undefined,
	option: string,
): T {
	const keys = workspace.teams.map((t) => t.key).join(", ");
	if (value) {
		const needle = value.trim().toLowerCase();
		const exact = workspace.teams.find(
			(t) => t.key.toLowerCase() === needle || t.id === value.trim(),
		);
		if (exact) return exact;
		const named = workspace.teams.filter(
			(t) => t.name.toLowerCase() === needle,
		);
		if (named.length > 1) {
			throw new LinearLookupError(
				`Several Linear teams are named ${value}`,
				`Pass a team key with ${option}: ${named.map((t) => t.key).join(", ")}`,
			);
		}
		const team = named[0];
		if (!team) {
			throw new LinearLookupError(
				`Linear team not found: ${value}`,
				`Teams: ${keys}`,
			);
		}
		return team;
	}
	const [only, ...rest] = workspace.teams;
	if (!only) {
		throw new LinearLookupError(
			"Your Linear workspace has no teams",
			"Create a team in Linear first",
		);
	}
	if (rest.length > 0) {
		throw new LinearLookupError(
			`Pick a Linear team with ${option}`,
			`Teams: ${keys}`,
		);
	}
	return only;
}

/** By id or name, within the team. */
export function findLinearStateId(team: Team, value: string): string {
	const needle = value.trim().toLowerCase();
	const state = team.states.find(
		(s) => s.id === value || s.name.toLowerCase() === needle,
	);
	if (!state) {
		throw new LinearLookupError(
			`Status not found in ${team.key}: ${value}`,
			`Statuses: ${team.states.map((s) => s.name).join(", ")}`,
		);
	}
	return state.id;
}

const LINEAR_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** By Linear user id or email. An id passes through: the workspace lists only the first 250 users. */
export function findLinearUserId(workspace: Workspace, value: string): string {
	if (LINEAR_ID.test(value.trim())) return value.trim();
	const needle = value.trim().toLowerCase();
	const user = workspace.users.find(
		(u) => u.id === value || u.email?.toLowerCase() === needle,
	);
	if (!user) {
		throw new LinearLookupError(
			`Linear user not found: ${value}`,
			"Pass a Linear user id or the email on their Linear account",
		);
	}
	return user.id;
}
