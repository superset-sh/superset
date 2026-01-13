import { trpc } from "renderer/lib/trpc";

type CloseContext = {
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
 * Mutation hook for closing a workspace without deleting the worktree
 * Uses optimistic updates to immediately remove workspace from UI,
 * then performs actual close in background.
 */
export function useCloseWorkspace(
	options?: Parameters<typeof trpc.workspaces.close.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.close.useMutation({
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

			// Switch to next workspace to prevent "no workspace" flash
			if (previousActive?.id === id) {
				const remainingWorkspaces = previousAll
					?.filter((w) => w.id !== id)
					.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

				if (remainingWorkspaces && remainingWorkspaces.length > 0) {
					// Find a workspace with full data available in previousGrouped
					let selectedWorkspace = null;
					let projectGroup = null;
					let workspaceFromGrouped = null;

					for (const candidate of remainingWorkspaces) {
						const group = previousGrouped?.find((g) =>
							g.workspaces.some((w) => w.id === candidate.id),
						);
						if (group) {
							selectedWorkspace = candidate;
							projectGroup = group;
							workspaceFromGrouped = group.workspaces.find(
								(w) => w.id === candidate.id,
							);
							break;
						}
					}

					if (selectedWorkspace && projectGroup && workspaceFromGrouped) {
						const worktreeData =
							workspaceFromGrouped.type === "worktree"
								? {
										branch: selectedWorkspace.branch,
										baseBranch: null,
										gitStatus: {
											branch: selectedWorkspace.branch,
											needsRebase: false,
											lastRefreshed: Date.now(),
										},
									}
								: null;

						utils.workspaces.getActive.setData(undefined, {
							...selectedWorkspace,
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
						// Fallback: set minimal data to prevent StartView flash (refetch will populate full data)
						const fallback = remainingWorkspaces[0];
						utils.workspaces.getActive.setData(undefined, {
							...fallback,
							type: fallback.type === "branch" ? "branch" : "worktree",
							worktreePath: "",
							project: null,
							worktree: null,
						});
					}
				} else {
					utils.workspaces.getActive.setData(undefined, null);
				}
			}

			// Return context for rollback
			return { previousGrouped, previousAll, previousActive } as CloseContext;
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
			// Invalidate to ensure consistency with backend state
			await utils.workspaces.invalidate();
			// Invalidate project queries since close updates project metadata
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
