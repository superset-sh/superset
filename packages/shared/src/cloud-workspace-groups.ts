export type CloudWorkspaceSort = "activity" | "created";

export interface CloudWorkspacePeriod {
	unit: "day" | "week" | "month" | "year";
	count: number;
}

interface Person {
	userId: string;
	name: string;
	image: string | null;
}

type SortableWorkspace = { agentStatusAt: Date | null; createdAt: Date };

type GroupedWorkspace = SortableWorkspace & {
	id: string;
	createdBy: Person | null;
	presence: (Person & { lastSeenAt: Date })[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const lastAgentMessageAt = (workspace: SortableWorkspace) =>
	(workspace.agentStatusAt ?? workspace.createdAt).getTime();

const sortedAt = (workspace: SortableWorkspace, sort: CloudWorkspaceSort) =>
	sort === "created"
		? workspace.createdAt
		: (workspace.agentStatusAt ?? workspace.createdAt);

const localMidnight = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function periodOf(date: Date, now: Date): CloudWorkspacePeriod {
	const days = Math.max(
		0,
		Math.round((localMidnight(now) - localMidnight(date)) / DAY_MS),
	);
	if (days < 7) return { unit: "day", count: days };
	if (days < 30) return { unit: "week", count: Math.floor(days / 7) };
	if (days < 365) return { unit: "month", count: Math.floor(days / 30) };
	return { unit: "year", count: Math.floor(days / 365) };
}

export function sortByLastAgentMessage<Workspace extends SortableWorkspace>(
	workspaces: Workspace[],
): Workspace[] {
	return [...workspaces].sort(
		(left, right) => lastAgentMessageAt(right) - lastAgentMessageAt(left),
	);
}

export function sortCloudWorkspaces<Workspace extends SortableWorkspace>(
	workspaces: Workspace[],
	sort: CloudWorkspaceSort,
): Workspace[] {
	return sort === "created"
		? [...workspaces].sort(
				(left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
			)
		: sortByLastAgentMessage(workspaces);
}

export function groupCloudWorkspacesByTime<
	Workspace extends SortableWorkspace,
>({
	workspaces,
	now,
	sort,
	at = (workspace) => sortedAt(workspace, sort),
}: {
	workspaces: Workspace[];
	now: Date;
	sort: CloudWorkspaceSort;
	at?: (workspace: Workspace) => Date;
}): { period: CloudWorkspacePeriod; workspaces: Workspace[] }[] {
	const groups = new Map<
		string,
		{ period: CloudWorkspacePeriod; workspaces: Workspace[] }
	>();
	const ordered = [...workspaces].sort(
		(left, right) => at(right).getTime() - at(left).getTime(),
	);
	for (const workspace of ordered) {
		const period = periodOf(at(workspace), now);
		const key = `${period.unit}:${period.count}`;
		const group = groups.get(key) ?? { period, workspaces: [] };
		group.workspaces.push(workspace);
		groups.set(key, group);
	}
	return [...groups.values()];
}

export function groupCloudWorkspaces<Workspace extends GroupedWorkspace>({
	workspaces,
	userId,
	now,
	activeWithinMs,
	sort = "activity",
}: {
	workspaces: Workspace[];
	userId: string | null;
	now: Date;
	activeWithinMs: number;
	sort?: CloudWorkspaceSort;
}): { person: Person | null; workspaces: Workspace[] }[] {
	const groups = new Map<
		string,
		{ person: Person | null; workspaces: Workspace[] }
	>();
	for (const workspace of sortCloudWorkspaces(workspaces, sort)) {
		const inItNow = workspace.presence.find(
			(person) => now.getTime() - person.lastSeenAt.getTime() < activeWithinMs,
		);
		const person: Person | null = inItNow
			? { userId: inItNow.userId, name: inItNow.name, image: inItNow.image }
			: workspace.createdBy;
		const key = person?.userId ?? "";
		const group = groups.get(key) ?? { person, workspaces: [] };
		group.workspaces.push(workspace);
		groups.set(key, group);
	}
	return [...groups.values()].sort((left, right) => {
		if (left.person?.userId === userId) return -1;
		if (right.person?.userId === userId) return 1;
		if (!left.person) return 1;
		if (!right.person) return -1;
		return left.person.name.localeCompare(right.person.name);
	});
}
