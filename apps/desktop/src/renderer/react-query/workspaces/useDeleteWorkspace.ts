import { useNavigate, useParams } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

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
	wasViewingDeleted: boolean;
	navigatedTo: string | null;
};

/**
 * Mutation hook for deleting a workspace with optimistic updates.
 * Server marks `deletingAt` immediately so refetches stay correct during slow git operations.
 * Optimistically navigates away immediately if the deleted workspace is currently being viewed.
 * Navigates back on error to restore the user to the original workspace.
 */
export function useDeleteWorkspace(
	options?: Parameters<typeof trpc.workspaces.delete.useMutation>[0],
) {
	const utils = trpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false });

	return trpc.workspaces.delete.useMutation({
		...options,
		onMutate: async ({ id }) => {
			// Check if we're viewing the workspace being deleted
			const wasViewingDeleted = params.workspaceId === id;
			let navigatedTo: string | null = null;

			// If viewing deleted workspace, get navigation target BEFORE optimistic update
			if (wasViewingDeleted) {
				const prevWorkspaceId =
					await utils.workspaces.getPreviousWorkspace.fetch({ id });
				const nextWorkspaceId = await utils.workspaces.getNextWorkspace.fetch({
					id,
				});
				const targetWorkspaceId = prevWorkspaceId ?? nextWorkspaceId;

				if (targetWorkspaceId) {
					navigatedTo = targetWorkspaceId;
					navigateToWorkspace(targetWorkspaceId, navigate);
				} else {
					navigatedTo = "/workspace";
					navigate({ to: "/workspace" });
				}
			}

			// Cancel outgoing queries and get snapshots
			await Promise.all([
				utils.workspaces.getAll.cancel(),
				utils.workspaces.getAllGrouped.cancel(),
			]);

			const previousGrouped = utils.workspaces.getAllGrouped.getData();
			const previousAll = utils.workspaces.getAll.getData();

			// Optimistic update: remove workspace from cache
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

			return {
				previousGrouped,
				previousAll,
				wasViewingDeleted,
				navigatedTo,
			} as DeleteContext;
		},
		onSettled: async (...args) => {
			await utils.workspaces.invalidate();
			await options?.onSettled?.(...args);
		},
		onSuccess: async (data, variables, ...rest) => {
			// Navigation already handled in onMutate (optimistic)
			await options?.onSuccess?.(data, variables, ...rest);
		},
		onError: async (_err, variables, context, ...rest) => {
			// Rollback optimistic cache updates
			if (context?.previousGrouped !== undefined) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					context.previousGrouped,
				);
			}
			if (context?.previousAll !== undefined) {
				utils.workspaces.getAll.setData(undefined, context.previousAll);
			}

			// If we optimistically navigated away, navigate back to the deleted workspace
			if (context?.wasViewingDeleted) {
				navigateToWorkspace(variables.id, navigate);
			}

			await options?.onError?.(_err, variables, context, ...rest);
		},
	});
}
