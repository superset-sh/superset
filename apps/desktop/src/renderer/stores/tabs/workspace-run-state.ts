import type { Pane } from "shared/tabs-types";

type PaneWorkspaceRun = NonNullable<Pane["workspaceRun"]>;
type WorkspaceRunState = PaneWorkspaceRun["state"];

export function createNextPaneWorkspaceRunState(
	workspaceRun: PaneWorkspaceRun,
	state: WorkspaceRunState,
): PaneWorkspaceRun {
	return {
		...workspaceRun,
		state,
	};
}
