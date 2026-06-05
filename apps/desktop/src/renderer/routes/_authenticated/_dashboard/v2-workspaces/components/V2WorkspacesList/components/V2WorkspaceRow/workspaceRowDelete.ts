import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

export interface WorkspaceDeleteIntent {
	workspaceId: string;
	workspaceName: string;
}

/**
 * Main workspaces cannot be deleted through the normal workspace-delete saga
 * (the server rejects it). They are removed by un-registering the project from
 * the host instead, so the overview must not offer a Delete affordance for them.
 */
export function isWorkspaceDeletable(
	workspace: Pick<AccessibleV2Workspace, "type">,
): boolean {
	return workspace.type !== "main";
}

export function buildWorkspaceDeleteIntent(
	workspace: Pick<AccessibleV2Workspace, "id" | "name">,
): WorkspaceDeleteIntent {
	return {
		workspaceId: workspace.id,
		workspaceName: workspace.name,
	};
}
