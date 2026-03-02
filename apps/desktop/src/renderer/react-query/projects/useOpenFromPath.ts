import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Mutation hook for opening a project from a given path
 * Used when dragging folders into the sidebar
 */
export function useOpenFromPath(
	options?: Parameters<
		typeof electronTrpc.projects.openFromPath.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.projects.openFromPath.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate projects query
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
