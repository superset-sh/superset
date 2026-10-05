export interface ProjectDeletionTarget {
	hostId: string;
	name: string;
	url: string | null;
	isLocal: boolean;
	isOnline: boolean;
	canDelete: boolean;
}

export interface WorkspaceActivity {
	createdByUserId: string | null;
	runningTerminalCount: number;
	runningAgentCount: number;
	lastActiveAt: number | null;
}

export interface PersonActivity {
	userId: string | null;
	runningTerminalCount: number;
	runningAgentCount: number;
	lastActiveAt: number | null;
}

export function defaultProjectDeletionSelection(
	targets: ProjectDeletionTarget[],
): string[] {
	const available = targets.filter(
		(target) => target.canDelete && target.isOnline,
	);
	const local = available.find((target) => target.isLocal);
	if (local) return [local.hostId];
	const only = available[0];
	return available.length === 1 && only ? [only.hostId] : [];
}

export function isDeletableTarget(
	target: ProjectDeletionTarget,
): target is ProjectDeletionTarget & { url: string } {
	return target.url !== null && target.isOnline && target.canDelete;
}

/**
 * Other people's live terminals and agents on one device, one entry per
 * person. Workspaces with no recorded creator belong to nobody we can name
 * and are grouped under a null user.
 */
export function summarizeOthersActivity(
	workspaces: WorkspaceActivity[],
	viewerUserId: string | undefined,
): PersonActivity[] {
	const byUser = new Map<string | null, PersonActivity>();
	for (const workspace of workspaces) {
		if (workspace.createdByUserId === viewerUserId) continue;
		if (workspace.runningTerminalCount + workspace.runningAgentCount === 0)
			continue;
		const person = byUser.get(workspace.createdByUserId) ?? {
			userId: workspace.createdByUserId,
			runningTerminalCount: 0,
			runningAgentCount: 0,
			lastActiveAt: null,
		};
		person.runningTerminalCount += workspace.runningTerminalCount;
		person.runningAgentCount += workspace.runningAgentCount;
		person.lastActiveAt =
			Math.max(person.lastActiveAt ?? 0, workspace.lastActiveAt ?? 0) || null;
		byUser.set(workspace.createdByUserId, person);
	}
	return [...byUser.values()];
}
