import type { workspaces, worktrees } from "@superset/local-db";
import type { DraftWorkspaceProvisioningJob } from "main/lib/workspace-init-manager";

export function buildDraftWorkspaceRow(
	draft: DraftWorkspaceProvisioningJob,
): typeof workspaces.$inferSelect {
	return {
		id: draft.workspaceId,
		projectId: draft.projectId,
		worktreeId: draft.worktreeId,
		type: "worktree",
		branch: draft.branch,
		name: draft.workspaceName,
		tabOrder: Number.MAX_SAFE_INTEGER,
		createdAt: draft.startedAt,
		updatedAt: draft.startedAt,
		lastOpenedAt: draft.startedAt,
		isUnread: false,
		isUnnamed: draft.isUnnamed,
		deletingAt: null,
		portBase: null,
		sectionId: null,
	};
}

export function buildDraftWorktreeRow(
	draft: DraftWorkspaceProvisioningJob,
): typeof worktrees.$inferSelect {
	return {
		id: draft.worktreeId,
		projectId: draft.projectId,
		path: draft.worktreePath,
		branch: draft.branch,
		baseBranch: draft.compareBaseBranch,
		createdAt: draft.startedAt,
		gitStatus: null,
		githubStatus: null,
		createdBySuperset: true,
	};
}
