import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for reordering projects
 * Automatically invalidates workspace and project queries on success
 */
export function useReorderProjects(
	options?: Parameters<typeof trpc.projects.reorder.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.projects.reorder.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.workspaces.getAllGrouped.invalidate();
			await utils.projects.getRecents.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
