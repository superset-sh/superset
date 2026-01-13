import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Mutation hook for updating a project (name, color, etc.)
 * Automatically invalidates project + workspace queries on success
 */
export function useUpdateProject(
	options?: Parameters<typeof electronTrpc.projects.update.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.projects.update.useMutation({
		...options,
		onSuccess: async (...args) => {
			await Promise.all([
				utils.projects.getRecents.invalidate(),
				utils.workspaces.getAllGrouped.invalidate(),
			]);

			await options?.onSuccess?.(...args);
		},
	});
}
