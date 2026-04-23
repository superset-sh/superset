import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Archive project: invalidates sidebar queries, strips local tabs for its workspaces.
 */
export function useArchiveProject(
	options?: Parameters<typeof electronTrpc.projects.archive.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.projects.archive.useMutation({
		...options,
		onSuccess: async (...args) => {
			const [data] = args;
			useTabsStore.getState().removeTabsForWorkspaceIds(data.workspaceIds);
			await Promise.all([
				utils.workspaces.getAllGrouped.invalidate(),
				utils.projects.getRecents.invalidate(),
				utils.projects.getArchived.invalidate(),
			]);
			await options?.onSuccess?.(...args);
		},
	});
}
