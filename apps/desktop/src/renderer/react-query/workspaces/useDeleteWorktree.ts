import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for deleting a closed worktree (one without an active workspace).
 * Handles cache invalidation for worktree-related queries.
 */
export function useDeleteWorktree(
	options?: Parameters<typeof trpc.workspaces.deleteWorktree.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.deleteWorktree.useMutation({
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
