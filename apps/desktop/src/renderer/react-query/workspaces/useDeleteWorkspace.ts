import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for deleting a workspace.
 * Server marks `deletingAt` immediately, so refetches during slow git operations stay correct.
 */
export function useDeleteWorkspace(
	options?: Parameters<typeof trpc.workspaces.delete.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.delete.useMutation({
		...options,
		onMutate: async ({ id }) => {
			await Promise.all([
				utils.workspaces.getAll.cancel(),
				utils.workspaces.getAllGrouped.cancel(),
				utils.workspaces.getActive.cancel(),
			]);

			utils.workspaces.getAll.setData(undefined, (old) =>
				old?.filter((w) => w.id !== id),
			);

			utils.workspaces.getAllGrouped.setData(undefined, (old) =>
				old
					?.map((group) => ({
						...group,
						workspaces: group.workspaces.filter((w) => w.id !== id),
					}))
					.filter((group) => group.workspaces.length > 0),
			);

			utils.workspaces.getActive.setData(undefined, (old) =>
				old?.id === id ? null : old,
			);
		},
		onSettled: async (...args) => {
			await utils.workspaces.invalidate();
			await options?.onSettled?.(...args);
		},
		onSuccess: async (...args) => {
			await options?.onSuccess?.(...args);
		},
		onError: async (...args) => {
			await options?.onError?.(...args);
		},
	});
}
