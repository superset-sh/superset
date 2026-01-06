import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for setting the active workspace
 * Automatically invalidates getActive and getAll queries on success
 */
export function useSetActiveWorkspace(
	options?: Parameters<typeof trpc.workspaces.setActive.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.setActive.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate active workspace and all workspaces queries
			await utils.workspaces.getActive.invalidate();
			await utils.workspaces.getAll.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
