type AutomationRunWorkspaceSource = {
	v2WorkspaceId?: string | null;
	workspaceId?: string | null;
};

type LegacyAutomationWorkspaceSource = {
	name?: string | null;
	branch?: string | null;
	type?: string | null;
	taskId?: string | null;
};

const LEGACY_AUTOMATION_RUN_BRANCH_PATTERN =
	/-\d+-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/;

export function getAutomationRunWorkspaceIds(
	runs: readonly AutomationRunWorkspaceSource[],
): Set<string> {
	const ids = new Set<string>();
	for (const run of runs) {
		const workspaceId = run.v2WorkspaceId ?? run.workspaceId ?? null;
		if (workspaceId) ids.add(workspaceId);
	}
	return ids;
}

export function isAutomationRunWorkspace(
	workspaceId: string,
	automationRunWorkspaceIds: ReadonlySet<string>,
): boolean {
	return automationRunWorkspaceIds.has(workspaceId);
}

export function isLegacyAutomationRunWorkspace(
	workspace: LegacyAutomationWorkspaceSource,
	automationNames: ReadonlySet<string>,
): boolean {
	if (workspace.type !== "worktree") return false;
	if (workspace.taskId) return false;
	if (!workspace.name || !automationNames.has(workspace.name)) return false;
	return LEGACY_AUTOMATION_RUN_BRANCH_PATTERN.test(workspace.branch ?? "");
}

export function getNonAutomationRunWorkspaces<Workspace extends { id: string }>(
	workspaces: readonly Workspace[],
	automationRunWorkspaceIds: ReadonlySet<string>,
	automationNames: ReadonlySet<string> = new Set(),
): Workspace[] {
	return workspaces.filter(
		(workspace) =>
			!isAutomationRunWorkspace(workspace.id, automationRunWorkspaceIds) &&
			!isLegacyAutomationRunWorkspace(
				workspace as Workspace & LegacyAutomationWorkspaceSource,
				automationNames,
			),
	);
}
