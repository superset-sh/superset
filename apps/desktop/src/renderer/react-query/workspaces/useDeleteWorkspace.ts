import { useNavigate, useParams } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useLocalHostServiceOptional } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	getWorkspaceFocusTargetAfterRemoval,
	removeWorkspaceFromGroups,
} from "./utils/workspace-removal";

/**
 * The electron delete path only kills the main-process daemon's terminals, so a
 * v2 workspace's host-service sessions (backgrounded ones included) would leak.
 * Best-effort: tell the local host-service to dispose them. Never blocks delete.
 */
function disposeHostSessionsForWorkspace(
	activeHostUrl: string | null,
	workspaceId: string,
): void {
	if (!activeHostUrl) return;
	getHostServiceClientByUrl(activeHostUrl)
		.terminal.disposeWorkspaceSessions.mutate({ workspaceId })
		.catch((error) => {
			console.warn("Failed to dispose host sessions for deleted workspace", {
				workspaceId,
				error,
			});
		});
}

type DeleteContext = {
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
	wasViewingDeleted: boolean;
};

export function useDeleteWorkspace(
	options?: Parameters<typeof electronTrpc.workspaces.delete.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false });
	const activeHostUrl = useLocalHostServiceOptional()?.activeHostUrl ?? null;

	return electronTrpc.workspaces.delete.useMutation({
		...options,
		onMutate: async ({ id }) => {
			const wasViewingDeleted = params.workspaceId === id;

			await Promise.all([
				utils.workspaces.getAll.cancel(),
				utils.workspaces.getAllGrouped.cancel(),
			]);

			const previousGrouped =
				utils.workspaces.getAllGrouped.getData() ??
				(wasViewingDeleted
					? await utils.workspaces.getAllGrouped.fetch().catch((error) => {
							console.warn(
								"Failed to fetch grouped workspaces during delete",
								error,
							);
							return undefined;
						})
					: undefined);
			const previousAll = utils.workspaces.getAll.getData();

			if (wasViewingDeleted) {
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

			if (previousGrouped) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					removeWorkspaceFromGroups(previousGrouped, id),
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
			} as DeleteContext;
		},
		onSettled: async (...args) => {
			await utils.workspaces.invalidate();
			await options?.onSettled?.(...args);
		},
		onSuccess: async (data, variables, context, ...rest) => {
			// Delete succeeded on the electron path — dispose the workspace's
			// host-service terminals so backgrounded sessions don't leak.
			if (data.success) {
				disposeHostSessionsForWorkspace(activeHostUrl, variables.id);
			}
			// tRPC treats { success: false } as a successful response, so roll back optimistic updates
			if (!data.success) {
				if (context?.previousGrouped !== undefined) {
					utils.workspaces.getAllGrouped.setData(
						undefined,
						context.previousGrouped,
					);
				}
				if (context?.previousAll !== undefined) {
					utils.workspaces.getAll.setData(undefined, context.previousAll);
				}

				if (context?.wasViewingDeleted) {
					navigateToWorkspace(variables.id, navigate);
				}
			}

			await options?.onSuccess?.(data, variables, context, ...rest);
		},
		onError: async (_err, variables, context, ...rest) => {
			if (context?.previousGrouped !== undefined) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					context.previousGrouped,
				);
			}
			if (context?.previousAll !== undefined) {
				utils.workspaces.getAll.setData(undefined, context.previousAll);
			}

			if (context?.wasViewingDeleted) {
				navigateToWorkspace(variables.id, navigate);
			}

			await options?.onError?.(_err, variables, context, ...rest);
		},
	});
}
