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
 * Mutation hook for deleting a workspace
 * Uses optimistic updates to immediately remove workspace from UI,
 * then performs actual deletion in background.
 */
export function useDeleteWorkspace(
	options?: Parameters<typeof trpc.workspaces.delete.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.delete.useMutation({
		...options,
		onMutate: async ({ id }) => {
			// Cancel outgoing refetches to avoid overwriting optimistic update
			await Promise.all([
				utils.workspaces.getAll.cancel(),
				utils.workspaces.getAllGrouped.cancel(),
				utils.workspaces.getActive.cancel(),
			]);

			// Snapshot previous values for rollback
			const previousGrouped = utils.workspaces.getAllGrouped.getData();
			const previousAll = utils.workspaces.getAll.getData();
			const previousActive = utils.workspaces.getActive.getData();

			// Optimistically remove workspace from getAllGrouped cache
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

			// Optimistically remove workspace from getAll cache
			if (previousAll) {
				utils.workspaces.getAll.setData(
					undefined,
					previousAll.filter((w) => w.id !== id),
				);
			}

			// If deleting the active workspace, switch to another workspace optimistically
			// This prevents a flash of "no workspace" state while the backend processes
			if (previousActive?.id === id) {
				// Find the next workspace to switch to (matches backend logic: most recently opened)
				const remainingWorkspaces = previousAll
					?.filter((w) => w.id !== id)
					.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

				if (remainingWorkspaces && remainingWorkspaces.length > 0) {
					const nextWorkspace = remainingWorkspaces[0];
					// Find the project info for the next workspace from grouped data
					const projectGroup = previousGrouped?.find((g) =>
						g.workspaces.some((w) => w.id === nextWorkspace.id),
					);
					const workspaceFromGrouped = projectGroup?.workspaces.find(
						(w) => w.id === nextWorkspace.id,
					);

					if (projectGroup && workspaceFromGrouped) {
						// For worktree-type workspaces, provide minimal worktree data to prevent
						// hasIncompleteInit from triggering the initialization view
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
						// Fallback: just clear it and let invalidate handle it
						utils.workspaces.getActive.setData(undefined, null);
					}
				} else {
					// No remaining workspaces
					utils.workspaces.getActive.setData(undefined, null);
				}
			}

			// Return context for rollback
			return { previousGrouped, previousAll, previousActive } as DeleteContext;
		},
		onError: (_err, _variables, context) => {
			// Rollback to previous state on error
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
		},
		onSuccess: async (...args) => {
			// Selective invalidation: only invalidate list queries, not getActive
			// This preserves our optimistic update for the active workspace and prevents
			// the "hasIncompleteInit" flash when switching to a workspace with null gitStatus
			await Promise.all([
				utils.workspaces.getAllGrouped.invalidate(),
				utils.workspaces.getAll.invalidate(),
			]);

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
