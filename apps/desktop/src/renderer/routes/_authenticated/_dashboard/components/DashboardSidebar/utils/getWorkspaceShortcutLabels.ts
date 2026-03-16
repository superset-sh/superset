import type { DashboardSidebarWorkspace } from "../types";

const MAX_SHORTCUT_COUNT = 9;

export function getWorkspaceShortcutLabels(
	workspaces: DashboardSidebarWorkspace[],
): Map<string, string> {
	return new Map(
		workspaces
			.slice(0, MAX_SHORTCUT_COUNT)
			.map((workspace, index) => [workspace.id, `⌘${index + 1}`]),
	);
}
