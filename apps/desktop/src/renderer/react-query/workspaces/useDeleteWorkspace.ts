import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for deleting a workspace
 * Automatically invalidates all workspace queries on success
 */
export function useDeleteWorkspace(
	options?: Parameters<typeof trpc.workspaces.delete.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.delete.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
