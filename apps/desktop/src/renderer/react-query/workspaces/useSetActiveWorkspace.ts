import { toast } from "@superset/ui/sonner";
import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for setting the active workspace
 * Automatically invalidates getActive and getAll queries on success
 * Shows undo toast if workspace was marked as unread (auto-cleared on switch)
 */
export function useSetActiveWorkspace(
	options?: Parameters<typeof trpc.workspaces.setActive.useMutation>[0],
) {
	const utils = trpc.useUtils();
	const setUnread = trpc.workspaces.setUnread.useMutation({
		onSuccess: () => {
			utils.workspaces.getAllGrouped.invalidate();
		},
		onError: (error) => {
			console.error("[workspace/setUnread] Failed to update unread status:", {
				error: error.message,
			});
			toast.error(`Failed to undo: ${error.message}`);
		},
	});

	return trpc.workspaces.setActive.useMutation({
		...options,
		onError: (error, variables, context, meta) => {
			console.error("[workspace/setActive] Failed to set active workspace:", {
				workspaceId: variables.id,
				error: error.message,
			});
			toast.error(`Failed to switch workspace: ${error.message}`);
			options?.onError?.(error, variables, context, meta);
		},
		onSuccess: async (data, variables, ...rest) => {
			// Auto-invalidate active workspace and all workspaces queries
			await Promise.all([
				utils.workspaces.getActive.invalidate(),
				utils.workspaces.getAll.invalidate(),
				utils.workspaces.getAllGrouped.invalidate(),
			]);

			// Show undo toast if workspace was marked as unread
			if (data.wasUnread) {
				toast("Marked as read", {
					description: "Workspace unread marker cleared",
					action: {
						label: "Undo",
						onClick: () => {
							setUnread.mutate({ id: variables.id, isUnread: true });
						},
					},
					duration: 5000,
				});
			}

			// Call user's onSuccess if provided
			// biome-ignore lint/suspicious/noExplicitAny: spread args for compatibility
			await (options?.onSuccess as any)?.(data, variables, ...rest);
		},
	});
}
