import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import type { V2WorkspacesSortMode } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

/** Best-known activity timestamp: last agent event, else creation. */
export function workspaceActivityAt(workspace: AccessibleV2Workspace): number {
	return Math.max(
		workspace.lastAgentEventAt ?? 0,
		workspace.createdAt.getTime(),
	);
}

function workspaceChurn(workspace: AccessibleV2Workspace): number {
	if (!workspace.diffStats) return -1;
	return workspace.diffStats.additions + workspace.diffStats.deletions;
}

/** Shared by the list sections and board columns so both views order rows
 * identically. All modes are deterministic: ties fall back to activity. */
export function compareWorkspaces(
	a: AccessibleV2Workspace,
	b: AccessibleV2Workspace,
	mode: V2WorkspacesSortMode,
): number {
	let cmp = 0;
	switch (mode) {
		case "activity":
			cmp = workspaceActivityAt(b) - workspaceActivityAt(a);
			break;
		case "created":
			cmp = b.createdAt.getTime() - a.createdAt.getTime();
			break;
		case "churn":
			cmp = workspaceChurn(b) - workspaceChurn(a);
			break;
		case "name":
			cmp = a.name.localeCompare(b.name);
			break;
	}
	if (cmp !== 0) return cmp;
	return workspaceActivityAt(b) - workspaceActivityAt(a);
}
