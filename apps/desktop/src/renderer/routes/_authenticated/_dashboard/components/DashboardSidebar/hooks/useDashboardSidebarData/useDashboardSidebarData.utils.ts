import type { DashboardSidebarWorkspaceType } from "../../types";

// Sits above every real workspace so the pending row lines up with the real one,
// which is inserted via getPrependTabOrder.
export const PENDING_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;
export const MAIN_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;

export interface AutoIncludeWorkspaceCandidate {
	id: string;
	projectId: string;
	hostId: string;
	type: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean;
	name: string;
	branch: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface AutoIncludedSidebarWorkspace
	extends AutoIncludeWorkspaceCandidate {
	tabOrder: number;
	sectionId: string | null;
}

/**
 * Surface workspaces that exist in v2Workspaces (cloud-synced) but lack a
 * v2WorkspaceLocalState row (per-device localStorage) so they still render in
 * the sidebar. Without this, a workspace is filtered out of the sidebar's
 * inner-join with v2WorkspaceLocalState — invisible — until the user re-adopts
 * it. The dominant trigger is fresh localStorage on a device that already had
 * the workspace synced from the cloud (issue #4171).
 *
 * Both `main` and `worktree` types are surfaced; the original implementation
 * gated this on `type === "main"`, leaving worktrees silently invisible after
 * the v1.8.4 upgrade. Tab order is synthesized: mains pin to the top
 * (MAIN_WORKSPACE_TAB_ORDER), worktrees fall back to creation time so they
 * appear in chronological order after explicitly-positioned siblings.
 */
export function selectAutoIncludedLocalWorkspaces(args: {
	candidates: readonly AutoIncludeWorkspaceCandidate[];
	workspacesWithLocalStateIds: ReadonlySet<string>;
	sidebarProjectIds: ReadonlySet<string>;
	machineId: string;
}): AutoIncludedSidebarWorkspace[] {
	return args.candidates
		.filter(
			(workspace) =>
				!args.workspacesWithLocalStateIds.has(workspace.id) &&
				workspace.hostId === args.machineId &&
				args.sidebarProjectIds.has(workspace.projectId),
		)
		.map((workspace) => ({
			...workspace,
			tabOrder:
				workspace.type === "main"
					? MAIN_WORKSPACE_TAB_ORDER
					: workspace.createdAt.getTime(),
			sectionId: null,
		}));
}
