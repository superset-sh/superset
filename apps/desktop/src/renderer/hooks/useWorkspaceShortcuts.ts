import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useProjectGroupsStore } from "renderer/stores/project-groups-state";
import { groupProjectsBySidebarGroups } from "renderer/screens/main/components/WorkspaceSidebar/utils/groupProjectsBySidebarGroups";

/**
 * Shared hook for workspace keyboard shortcuts.
 * Used by WorkspaceSidebar for navigation between workspaces.
 *
 * Handles ⌘1-9 workspace switching shortcuts (global).
 */
	export function useWorkspaceShortcuts() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const projectGroups = useProjectGroupsStore((state) => state.groups);
	const projectAssignments = useProjectGroupsStore(
		(state) => state.projectAssignments,
	);
	const navigate = useNavigate();

	const orderedProjects = useMemo(
		() =>
			groupProjectsBySidebarGroups({
				projectGroups,
				projectAssignments,
				projects: groups,
			}).flatMap((bucket) => bucket.projects),
		[groups, projectAssignments, projectGroups],
	);

	const allWorkspaces = orderedProjects.flatMap((group) => {
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
		groups: orderedProjects,
		allWorkspaces,
	};
}
