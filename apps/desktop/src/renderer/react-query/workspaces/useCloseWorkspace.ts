import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for closing a workspace without deleting the worktree
 * Automatically invalidates all workspace queries on success
 */
export function useCloseWorkspace(
	options?: Parameters<typeof trpc.workspaces.close.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.close.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();
			// Invalidate project queries since close updates project metadata
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
