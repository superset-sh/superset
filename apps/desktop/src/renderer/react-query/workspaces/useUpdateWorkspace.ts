import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Mutation hook for updating a workspace
 * Automatically invalidates all workspace queries on success
 */
export function useUpdateWorkspace(
	options?: Parameters<typeof electronTrpc.workspaces.update.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.update.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
