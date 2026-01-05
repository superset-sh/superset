import { trpc } from "renderer/lib/trpc";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";

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
	const utils = trpc.useUtils();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);

	return trpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Add to global pending store (WorkspaceInitEffects will handle terminal creation)
			// This survives dialog unmounts since it's stored in Zustand, not a hook-local ref
			addPendingTerminalSetup({
				workspaceId: data.workspace.id,
				projectId: data.projectId,
				initialCommands: data.initialCommands,
			});

			// Handle race condition: if init already completed before we added to pending,
			// WorkspaceInitEffects will process it on next render when it sees the progress
			// is already "ready" and there's a matching pending setup.

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
