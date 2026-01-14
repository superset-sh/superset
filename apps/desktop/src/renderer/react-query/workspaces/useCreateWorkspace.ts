import { useNavigate } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

/**
 * Mutation hook for creating a new workspace
 * Automatically invalidates all workspace queries on success
 *
 * For worktree workspaces with async initialization:
 * - Returns immediately after workspace record is created
 * - Terminal tab is created by WorkspaceInitEffects when initialization completes
 *
 * For branch workspaces (no async init):
 * - Terminal setup is triggered immediately via WorkspaceInitEffects
 *
 * Note: Terminal creation is handled by WorkspaceInitEffects (always mounted in MainScreen)
 * to survive dialog unmounts. This hook just adds to the global pending store.
 */
export function useCreateWorkspace(
	options?: Parameters<typeof trpc.workspaces.create.useMutation>[0],
) {
	const navigate = useNavigate();
	const utils = trpc.useUtils();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);
	const updateProgress = useWorkspaceInitStore((s) => s.updateProgress);

	return trpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// CRITICAL: Set optimistic progress BEFORE invalidation AND navigation
			// to ensure isInitializing is true when workspace page first renders,
			// preventing the "Setup incomplete" flash.
			if (data.isInitializing) {
				const optimisticProgress: WorkspaceInitProgress = {
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					step: "pending",
					message: "Preparing...",
				};
				updateProgress(optimisticProgress);
			}

			// Add to global pending store (WorkspaceInitEffects will handle terminal creation)
			// This survives dialog unmounts since it's stored in Zustand, not a hook-local ref
			addPendingTerminalSetup({
				workspaceId: data.workspace.id,
				projectId: data.projectId,
				initialCommands: data.initialCommands,
			});

			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Handle race condition: if init already completed before we added to pending,
			// WorkspaceInitEffects will process it on next render when it sees the progress
			// is already "ready" and there's a matching pending setup.

			// Navigate to the new workspace immediately
			// The workspace exists in DB, so it's safe to navigate
			// Git operations happen in background with progress shown via toast
			navigateToWorkspace(data.workspace.id, navigate);

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
