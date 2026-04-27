import { useNavigate, useParams } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	getWorkspaceFocusTargetAfterRemoval,
	removeWorkspaceFromGroups,
} from "./utils/workspace-removal";

type CloseContext = {
	previousGrouped: ReturnType<
		typeof electronTrpc.useUtils
	>["workspaces"]["getAllGrouped"]["getData"] extends () => infer R
		? R
		: never;
	previousAll: ReturnType<
		typeof electronTrpc.useUtils
	>["workspaces"]["getAll"]["getData"] extends () => infer R
		? R
		: never;
	wasViewingClosed: boolean;
};

/**
 * Mutation hook for closing a workspace without deleting the worktree
 * Uses optimistic updates to immediately remove workspace from UI,
 * then performs actual close in background.
 * Automatically navigates away if the closed workspace is currently being viewed.
 */
export function useCloseWorkspace(
	options?: Parameters<typeof electronTrpc.workspaces.close.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false });

	return electronTrpc.workspaces.close.useMutation({
		...options,
		onMutate: async ({ id }) => {
			const wasViewingClosed = params.workspaceId === id;

			// Cancel outgoing refetches to avoid overwriting optimistic update
			await Promise.all([
				utils.workspaces.getAll.cancel(),
				utils.workspaces.getAllGrouped.cancel(),
			]);

			// Snapshot previous values for rollback
			const previousGrouped =
				utils.workspaces.getAllGrouped.getData() ??
				(wasViewingClosed
					? await utils.workspaces.getAllGrouped.fetch().catch((error) => {
							console.warn(
								"Failed to fetch grouped workspaces during close",
								error,
							);
							return undefined;
						})
					: undefined);
			const previousAll = utils.workspaces.getAll.getData();

			// If the closed workspace is currently being viewed, navigate away using
			// the pre-removal order.
			if (wasViewingClosed) {
				const targetWorkspaceId = getWorkspaceFocusTargetAfterRemoval(
					previousGrouped,
					id,
				);
				if (targetWorkspaceId) {
					navigateToWorkspace(targetWorkspaceId, navigate);
				} else {
					navigate({ to: "/workspace" });
				}
			}

			// Optimistically remove workspace from getAllGrouped cache
			if (previousGrouped) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					removeWorkspaceFromGroups(previousGrouped, id),
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
			return { previousGrouped, previousAll, wasViewingClosed } as CloseContext;
		},
		onError: async (err, variables, context, ...rest) => {
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
			if (context?.wasViewingClosed) {
				navigateToWorkspace(variables.id, navigate);
			}
			await options?.onError?.(err, variables, context, ...rest);
		},
		onSuccess: async (data, variables, ...rest) => {
			// Invalidate to ensure consistency with backend state
			await utils.workspaces.invalidate();
			// Invalidate project queries since close updates project metadata
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, variables, ...rest);
		},
	});
}
