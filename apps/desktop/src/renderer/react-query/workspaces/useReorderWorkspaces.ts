import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for reordering workspaces
 * Automatically invalidates workspace queries on success
 */
export function useReorderWorkspaces(
	options?: Parameters<typeof trpc.workspaces.reorder.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.reorder.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.workspaces.getAll.invalidate();
			await utils.projects.getAllWithWorkspaces.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}
