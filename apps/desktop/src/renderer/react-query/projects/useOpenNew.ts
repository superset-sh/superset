import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Mutation hook for opening a new project
 * Creates a Project record if it doesn't exist
 */
export function useOpenNew(
	options?: Parameters<typeof electronTrpc.projects.openNew.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.projects.openNew.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate projects query
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
