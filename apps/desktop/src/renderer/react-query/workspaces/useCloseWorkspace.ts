import { useNavigate, useParams } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

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
};

/**
 * Mutation hook for closing a workspace without deleting the worktree
 * Uses optimistic updates to immediately remove workspace from UI,
 * then performs actual close in background.
 * Automatically navigates away if the closed workspace is currently being viewed.
 */
export function useCloseWorkspace(
	options?: Parameters<typeof trpc.workspaces.close.useMutation>[0],
) {
	const utils = trpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false });

	return trpc.workspaces.close.useMutation({
		...options,
		onMutate: async ({ id }) => {
			// Cancel outgoing refetches to avoid overwriting optimistic update
			await Promise.all([
				utils.workspaces.getAll.cancel(),
				utils.workspaces.getAllGrouped.cancel(),
			]);

			// Snapshot previous values for rollback
			const previousGrouped = utils.workspaces.getAllGrouped.getData();
			const previousAll = utils.workspaces.getAll.getData();

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

			// Return context for rollback
			return { previousGrouped, previousAll } as CloseContext;
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
		},
		onSuccess: async (data, variables, ...rest) => {
			// Invalidate to ensure consistency with backend state
			await utils.workspaces.invalidate();
			// Invalidate project queries since close updates project metadata
			await utils.projects.getRecents.invalidate();

			// If the closed workspace is currently being viewed, navigate away
			if (params.workspaceId === variables.id) {
				// Try to navigate to previous workspace first, then next
				const prevWorkspaceId =
					await utils.workspaces.getPreviousWorkspace.fetch({
						id: variables.id,
					});
				const nextWorkspaceId = await utils.workspaces.getNextWorkspace.fetch({
					id: variables.id,
				});

				const targetWorkspaceId = prevWorkspaceId ?? nextWorkspaceId;

				if (targetWorkspaceId) {
					navigateToWorkspace(targetWorkspaceId, navigate);
				} else {
					// No other workspaces, navigate to workspace index (shows StartView)
					navigate({ to: "/workspace" });
				}
			}

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, variables, ...rest);
		},
	});
}
