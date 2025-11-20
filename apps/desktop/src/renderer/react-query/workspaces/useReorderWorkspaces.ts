import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for reordering workspaces
 * Automatically invalidates getAll query on success
 */
export function useReorderWorkspaces(
	options?: Parameters<typeof trpc.workspaces.reorder.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.reorder.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate workspaces list
			await utils.workspaces.getAll.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
