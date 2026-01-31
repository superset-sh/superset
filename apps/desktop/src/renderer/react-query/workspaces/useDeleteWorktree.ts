import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Mutation hook for deleting a closed worktree (one without an active workspace).
 * Handles cache invalidation for worktree-related queries.
 */
export function useDeleteWorktree(
	options?: Parameters<
		typeof electronTrpc.workspaces.deleteWorktree.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.deleteWorktree.useMutation({
		...options,
		onSettled: async (...args) => {
			// Invalidate worktree queries to refresh the list
			await utils.workspaces.getWorktreesByProject.invalidate();
			await options?.onSettled?.(...args);
		},
		onSuccess: async (...args) => {
			await options?.onSuccess?.(...args);
		},
		onError: async (...args) => {
			await options?.onError?.(...args);
		},
	});
}
