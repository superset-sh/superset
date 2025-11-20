import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for creating a new workspace
 * Automatically invalidates all workspace queries on success
 */
export function useCreateWorkspace(
	options?: Parameters<typeof trpc.workspaces.create.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
