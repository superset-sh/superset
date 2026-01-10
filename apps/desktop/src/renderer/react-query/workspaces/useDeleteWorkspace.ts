import { trpc } from "renderer/lib/trpc";

type DeleteContext = {
	previousGrouped: ReturnType<
		typeof trpc.useUtils
	>["workspaces"]["getAllGrouped"]["getData"] extends () => infer R
		? R
		: never;
	previousAll: ReturnType<
		typeof trpc.useUtils
	>["workspaces"]["getAll"]["getData"] extends () => infer R
		? R
		: never;
	previousActive: ReturnType<
		typeof trpc.useUtils
	>["workspaces"]["getActive"]["getData"] extends () => infer R
		? R
		: never;
};

/**
 * Mutation hook for deleting a workspace with optimistic updates.
 * Server marks `deletingAt` immediately so refetches stay correct during slow git operations.
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

			const previousGrouped = utils.workspaces.getAllGrouped.getData();
			const previousAll = utils.workspaces.getAll.getData();
			const previousActive = utils.workspaces.getActive.getData();

			if (previousGrouped) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					previousGrouped
						.map((group) => ({
							...group,
							workspaces: group.workspaces.filter((w) => w.id !== id),
						}))
						.filter((group) => group.workspaces.length > 0),
				);
			}

			if (previousAll) {
				utils.workspaces.getAll.setData(
					undefined,
					previousAll.filter((w) => w.id !== id),
				);
			}

			// Switch to next workspace to prevent "no workspace" flash
			if (previousActive?.id === id) {
				const remainingWorkspaces = previousAll
					?.filter((w) => w.id !== id)
					.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

				if (remainingWorkspaces && remainingWorkspaces.length > 0) {
					const nextWorkspace = remainingWorkspaces[0];
					const projectGroup = previousGrouped?.find((g) =>
						g.workspaces.some((w) => w.id === nextWorkspace.id),
					);
					const workspaceFromGrouped = projectGroup?.workspaces.find(
						(w) => w.id === nextWorkspace.id,
					);

					if (projectGroup && workspaceFromGrouped) {
						const worktreeData =
							workspaceFromGrouped.type === "worktree"
								? {
										branch: nextWorkspace.branch,
										baseBranch: null,
										gitStatus: {
											branch: nextWorkspace.branch,
											needsRebase: false,
											lastRefreshed: Date.now(),
										},
									}
								: null;

						utils.workspaces.getActive.setData(undefined, {
							...nextWorkspace,
							type: workspaceFromGrouped.type,
							worktreePath: workspaceFromGrouped.worktreePath,
							project: {
								id: projectGroup.project.id,
								name: projectGroup.project.name,
								mainRepoPath: projectGroup.project.mainRepoPath,
							},
							worktree: worktreeData,
						});
					} else {
						utils.workspaces.getActive.setData(undefined, null);
					}
				} else {
					utils.workspaces.getActive.setData(undefined, null);
				}
			}

			return { previousGrouped, previousAll, previousActive } as DeleteContext;
		},
		onSettled: async (...args) => {
			await utils.workspaces.invalidate();
			await options?.onSettled?.(...args);
		},
		onSuccess: async (...args) => {
			await options?.onSuccess?.(...args);
		},
		onError: async (_err, _variables, context, ...rest) => {
			if (context?.previousGrouped !== undefined) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					context.previousGrouped,
				);
			}
			if (context?.previousAll !== undefined) {
				utils.workspaces.getAll.setData(undefined, context.previousAll);
			}
			if (context?.previousActive !== undefined) {
				utils.workspaces.getActive.setData(undefined, context.previousActive);
			}

			await options?.onError?.(_err, _variables, context, ...rest);
		},
	});
}
