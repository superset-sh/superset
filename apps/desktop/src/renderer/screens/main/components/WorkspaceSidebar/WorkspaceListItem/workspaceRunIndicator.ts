import type { Pane, WorkspaceRunState } from "shared/tabs-types";

export function getWorkspaceRunStateFromPanes(
	panes: Record<string, Pane | undefined>,
	workspaceId: string,
): WorkspaceRunState | null {
	for (const pane of Object.values(panes)) {
		if (
			pane?.type === "terminal" &&
			pane.workspaceRun?.workspaceId === workspaceId
		) {
			return pane.workspaceRun.state;
		}
	}
	return null;
}

export function shouldShowWorkspaceRunIndicator(
	state: WorkspaceRunState | null,
): state is WorkspaceRunState {
	return state !== null;
}
