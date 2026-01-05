import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	useCreateBranchWorkspace,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";
import { useAppHotkey } from "renderer/stores/hotkeys";

/**
 * Shared hook for workspace keyboard shortcuts and auto-creation logic.
 * Used by WorkspaceSidebar for navigation between workspaces.
 *
 * It handles:
 * - ⌘1-9 workspace switching shortcuts
 * - Previous/next workspace shortcuts
 * - Auto-create main workspace for new projects
 */
export function useWorkspaceShortcuts() {
	const { data: groups = [] } = trpc.workspaces.getAllGrouped.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id || null;
	const setActiveWorkspace = useSetActiveWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();

	// Track projects we've attempted to create workspaces for (persists across renders)
	const attemptedProjectsRef = useRef<Set<string>>(new Set());
	const [isCreating, setIsCreating] = useState(false);

	// Auto-create main workspace for new projects (one-time per project)
	useEffect(() => {
		if (isCreating) return;

		for (const group of groups) {
			const projectId = group.project.id;
			const hasMainWorkspace = group.workspaces.some(
				(w) => w.type === "branch",
			);

			// Skip if already has main workspace or we've already attempted this project
			if (hasMainWorkspace || attemptedProjectsRef.current.has(projectId)) {
				continue;
			}

			// Mark as attempted before creating (prevents retries)
			attemptedProjectsRef.current.add(projectId);
			setIsCreating(true);

			// Auto-create fails silently - this is a background convenience feature
			createBranchWorkspace.mutate(
				{ projectId },
				{
					onSettled: () => {
						setIsCreating(false);
					},
				},
			);
			// Only create one at a time
			break;
		}
	}, [groups, isCreating, createBranchWorkspace]);

	// Flatten workspaces for keyboard navigation
	const allWorkspaces = groups.flatMap((group) => group.workspaces);

	const switchToWorkspace = useCallback(
		(index: number) => {
			const workspace = allWorkspaces[index];
			if (workspace) {
				setActiveWorkspace.mutate({ id: workspace.id });
			}
		},
		[allWorkspaces, setActiveWorkspace],
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

	useAppHotkey(
		"PREV_WORKSPACE",
		() => {
			if (!activeWorkspaceId) return;
			const currentIndex = allWorkspaces.findIndex(
				(w) => w.id === activeWorkspaceId,
			);
			if (currentIndex > 0) {
				setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex - 1].id });
			}
		},
		undefined,
		[activeWorkspaceId, allWorkspaces, setActiveWorkspace],
	);

	useAppHotkey(
		"NEXT_WORKSPACE",
		() => {
			if (!activeWorkspaceId) return;
			const currentIndex = allWorkspaces.findIndex(
				(w) => w.id === activeWorkspaceId,
			);
			if (currentIndex < allWorkspaces.length - 1) {
				setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex + 1].id });
			}
		},
		undefined,
		[activeWorkspaceId, allWorkspaces, setActiveWorkspace],
	);

	return {
		groups,
		allWorkspaces,
		activeWorkspaceId,
		setActiveWorkspace,
	};
}
