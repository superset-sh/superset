import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";
import { useHotkey } from "renderer/hotkeys";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { DashboardSidebarProject } from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/projectChildren";

const MAX_SHORTCUT_COUNT = 9;

function haveSameIds(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((id, index) => id === right[index])
	);
}

function useStableWorkspaceShortcutLabels(
	workspaces: Array<{ id: string }>,
): Map<string, string> {
	const previousRef = useRef<{
		workspaceIds: string[];
		labels: Map<string, string>;
	} | null>(null);

	return useMemo(() => {
		const workspaceIds = workspaces
			.slice(0, MAX_SHORTCUT_COUNT)
			.map((workspace) => workspace.id);
		const previous = previousRef.current;
		if (previous && haveSameIds(previous.workspaceIds, workspaceIds)) {
			return previous.labels;
		}

		const labels = new Map(
			workspaceIds.map((workspaceId, index) => [workspaceId, `⌘${index + 1}`]),
		);
		previousRef.current = { workspaceIds, labels };
		return labels;
	}, [workspaces]);
}

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
	const workspaceShortcutLabels =
		useStableWorkspaceShortcutLabels(flattenedWorkspaces);

	const switchToWorkspace = useCallback(
		(index: number) => {
			const workspace = flattenedWorkspaces[index];
			if (workspace) {
				navigateToV2Workspace(workspace.id, navigate);
			}
		},
		[flattenedWorkspaces, navigate],
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

	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	useHotkey("PREV_WORKSPACE", () => {
		if (!currentWorkspaceId || flattenedWorkspaces.length === 0) return;
		const index = flattenedWorkspaces.findIndex(
			(w) => w.id === currentWorkspaceId,
		);
		if (index === -1) return;
		const prevIndex = index <= 0 ? flattenedWorkspaces.length - 1 : index - 1;
		navigateToV2Workspace(flattenedWorkspaces[prevIndex].id, navigate);
	});

	useHotkey("NEXT_WORKSPACE", () => {
		if (!currentWorkspaceId || flattenedWorkspaces.length === 0) return;
		const index = flattenedWorkspaces.findIndex(
			(w) => w.id === currentWorkspaceId,
		);
		if (index === -1) return;
		const nextIndex = index >= flattenedWorkspaces.length - 1 ? 0 : index + 1;
		navigateToV2Workspace(flattenedWorkspaces[nextIndex].id, navigate);
	});

	return workspaceShortcutLabels;
}
