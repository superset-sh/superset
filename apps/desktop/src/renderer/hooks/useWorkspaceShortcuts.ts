import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

/**
 * Shared hook for workspace keyboard shortcuts.
 * Used by WorkspaceSidebar for navigation between workspaces.
 *
 * Handles ⌘1-9 workspace switching shortcuts (global).
 */
export function useWorkspaceShortcuts() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const navigate = useNavigate();

	const allWorkspaces = groups.flatMap((group) => {
		const topLevelWorkspacesById = new Map(
			group.workspaces.map((workspace) => [workspace.id, workspace]),
		);
		const sectionsById = new Map(
			(group.sections ?? []).map((section) => [section.id, section]),
		);

		return group.topLevelItems.flatMap((item) => {
			if (item.kind === "workspace") {
				const workspace = topLevelWorkspacesById.get(item.id);
				return workspace ? [workspace] : [];
			}

			return sectionsById.get(item.id)?.workspaces ?? [];
		});
	});

	const switchToWorkspace = useCallback(
		(index: number) => {
			const workspace = allWorkspaces[index];
			if (workspace) {
				navigateToWorkspace(workspace.id, navigate);
			}
		},
		[allWorkspaces, navigate],
	);

	useHotkey("JUMP_TO_WORKSPACE_1", () => switchToWorkspace(0));
	useHotkey("JUMP_TO_WORKSPACE_2", () => switchToWorkspace(1));
	useHotkey("JUMP_TO_WORKSPACE_3", () => switchToWorkspace(2));
	useHotkey("JUMP_TO_WORKSPACE_4", () => switchToWorkspace(3));
	useHotkey("JUMP_TO_WORKSPACE_5", () => switchToWorkspace(4));
	useHotkey("JUMP_TO_WORKSPACE_6", () => switchToWorkspace(5));
	useHotkey("JUMP_TO_WORKSPACE_7", () => switchToWorkspace(6));
	useHotkey("JUMP_TO_WORKSPACE_8", () => switchToWorkspace(7));
	useHotkey("JUMP_TO_WORKSPACE_9", () => switchToWorkspace(8));

	return {
		groups,
		allWorkspaces,
	};
}
