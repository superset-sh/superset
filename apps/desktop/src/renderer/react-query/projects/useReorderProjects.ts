import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Mutation hook for reordering projects
 * Automatically invalidates workspace and project queries on success
 */
export function useReorderProjects(
	options?: Parameters<typeof electronTrpc.projects.reorder.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.projects.reorder.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.workspaces.getAllGrouped.invalidate();
			await utils.workspaces.getPreviousWorkspace.invalidate();
			await utils.workspaces.getNextWorkspace.invalidate();
			await utils.projects.getRecents.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
