import type { Pane } from "shared/tabs-types";
import { useTabsStore } from "./store";

export type PaneWorkspaceRun = NonNullable<Pane["workspaceRun"]>;
export type WorkspaceRunState = PaneWorkspaceRun["state"];

export function createWorkspaceRun({
	workspaceId,
	state,
	command,
}: {
	workspaceId: string;
	state: WorkspaceRunState;
	command?: string;
}): PaneWorkspaceRun {
	return {
		workspaceId,
		state,
		...(command ? { command } : {}),
	};
}

export function getPaneWorkspaceRun(paneId: string): PaneWorkspaceRun | null {
	return useTabsStore.getState().panes[paneId]?.workspaceRun ?? null;
}

export function hasPaneWorkspaceRun(paneId: string): boolean {
	return Boolean(getPaneWorkspaceRun(paneId));
}

export function setPaneWorkspaceRunState(
	paneId: string,
	state: WorkspaceRunState,
): PaneWorkspaceRun | null {
	const workspaceRun = getPaneWorkspaceRun(paneId);
	if (!workspaceRun) return null;

	const nextWorkspaceRun = createWorkspaceRun({
		workspaceId: workspaceRun.workspaceId,
		state,
		command: workspaceRun.command,
	});

	useTabsStore.getState().setPaneWorkspaceRun(paneId, nextWorkspaceRun);
	return nextWorkspaceRun;
}
