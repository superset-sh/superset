import { electronTrpc } from "renderer/lib/electron-trpc";

export function useUnarchiveProject(
	options?: Parameters<typeof electronTrpc.projects.unarchive.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.projects.unarchive.useMutation({
		...options,
		onSuccess: async (...args) => {
			await Promise.all([
				utils.workspaces.getAllGrouped.invalidate(),
				utils.projects.getRecents.invalidate(),
				utils.projects.getArchived.invalidate(),
			]);
			await options?.onSuccess?.(...args);
		},
	});
}
