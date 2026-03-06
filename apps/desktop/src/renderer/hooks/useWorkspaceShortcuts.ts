import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { getUncollapsedWorkspaces } from "./workspaceShortcutsUtils";

export { getUncollapsedWorkspaces };

/**
 * Shared hook for workspace keyboard shortcuts.
 * Used by WorkspaceSidebar for navigation between workspaces.
 *
 * Handles ⌘1-9 workspace switching shortcuts (global).
 * Only applies shortcuts to workspaces in uncollapsed projects.
 */
export function useWorkspaceShortcuts() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const navigate = useNavigate();
	const collapsedProjectIds = useWorkspaceSidebarStore(
		(s) => s.collapsedProjectIds,
	);

	// Flatten workspaces for keyboard navigation, skipping collapsed projects
	const allWorkspaces = getUncollapsedWorkspaces(groups, collapsedProjectIds);

	const switchToWorkspace = useCallback(
		(index: number) => {
			const workspace = allWorkspaces[index];
			if (workspace) {
				navigateToWorkspace(workspace.id, navigate);
			}
		},
		[allWorkspaces, navigate],
	);

	useAppHotkey("JUMP_TO_WORKSPACE_1", () => switchToWorkspace(0), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_2", () => switchToWorkspace(1), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_3", () => switchToWorkspace(2), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_4", () => switchToWorkspace(3), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_5", () => switchToWorkspace(4), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_6", () => switchToWorkspace(5), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_7", () => switchToWorkspace(6), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_8", () => switchToWorkspace(7), undefined, [
		switchToWorkspace,
	]);
	useAppHotkey("JUMP_TO_WORKSPACE_9", () => switchToWorkspace(8), undefined, [
		switchToWorkspace,
	]);

	return {
		groups,
		allWorkspaces,
	};
}
