import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useAppHotkey } from "renderer/stores/hotkeys";
import type { DashboardSidebarProject } from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/projectChildren";

const MAX_SHORTCUT_COUNT = 9;

export function useDashboardSidebarShortcuts(
	groups: DashboardSidebarProject[],
) {
	const navigate = useNavigate();
	const flattenedWorkspaces = useMemo(
		() =>
			groups
				.flatMap((project) => getProjectChildrenWorkspaces(project.children))
				.filter((workspace) => !workspace.creationStatus),
		[groups],
	);
	const workspaceShortcutLabels = useMemo(
		() =>
			new Map(
				flattenedWorkspaces
					.slice(0, MAX_SHORTCUT_COUNT)
					.map((workspace, index) => [workspace.id, `⌘${index + 1}`]),
			),
		[flattenedWorkspaces],
	);

	const switchToWorkspace = useCallback(
		(index: number) => {
			const workspace = flattenedWorkspaces[index];
			if (workspace) {
				navigateToV2Workspace(workspace.id, navigate);
			}
		},
		[flattenedWorkspaces, navigate],
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

	return workspaceShortcutLabels;
}
