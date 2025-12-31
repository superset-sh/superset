import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import {
	useCreateBranchWorkspace,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";
import { HOTKEYS } from "shared/hotkeys";

/**
 * Shared hook for workspace keyboard shortcuts and auto-creation logic.
 * This hook should be used in both:
 * - WorkspacesTabs (top-bar mode)
 * - WorkspaceSidebar (sidebar mode)
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

	// Workspace switching shortcuts (⌘+1-9)
	const workspaceKeys = Array.from(
		{ length: 9 },
		(_, i) => `meta+${i + 1}`,
	).join(", ");

	const handleWorkspaceSwitch = useCallback(
		(event: KeyboardEvent) => {
			const num = Number(event.key);
			if (num >= 1 && num <= 9) {
				const workspace = allWorkspaces[num - 1];
				if (workspace) {
					setActiveWorkspace.mutate({ id: workspace.id });
				}
			}
		},
		[allWorkspaces, setActiveWorkspace],
	);

	const handlePrevWorkspace = useCallback(() => {
		if (!activeWorkspaceId) return;
		const currentIndex = allWorkspaces.findIndex(
			(w) => w.id === activeWorkspaceId,
		);
		if (currentIndex > 0) {
			setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex - 1].id });
		}
	}, [activeWorkspaceId, allWorkspaces, setActiveWorkspace]);

	const handleNextWorkspace = useCallback(() => {
		if (!activeWorkspaceId) return;
		const currentIndex = allWorkspaces.findIndex(
			(w) => w.id === activeWorkspaceId,
		);
		if (currentIndex < allWorkspaces.length - 1) {
			setActiveWorkspace.mutate({ id: allWorkspaces[currentIndex + 1].id });
		}
	}, [activeWorkspaceId, allWorkspaces, setActiveWorkspace]);

	useHotkeys(workspaceKeys, handleWorkspaceSwitch);
	useHotkeys(HOTKEYS.PREV_WORKSPACE.keys, handlePrevWorkspace);
	useHotkeys(HOTKEYS.NEXT_WORKSPACE.keys, handleNextWorkspace);

	return {
		groups,
		allWorkspaces,
		activeWorkspaceId,
		setActiveWorkspace,
	};
}
