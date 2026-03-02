import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Mutation hook for reordering workspaces
 * Automatically invalidates workspace queries on success
 */
export function useReorderWorkspaces(
	options?: Parameters<typeof electronTrpc.workspaces.reorder.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.reorder.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.workspaces.getAll.invalidate();
			await utils.workspaces.getAllGrouped.invalidate();
			await utils.workspaces.getPreviousWorkspace.invalidate();
			await utils.workspaces.getNextWorkspace.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
