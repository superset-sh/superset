import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateWorkspaceQueries } from "./invalidateWorkspaceQueries";

/**
 * Mutation hook for updating a workspace
 * Automatically invalidates all workspace queries on success
 */
export function useUpdateWorkspace(
	options?: Parameters<typeof electronTrpc.workspaces.update.useMutation>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.workspaces.update.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Explicitly invalidate each workspace query to ensure all consumers
			// (including PortsList which uses workspaces.getAll) get fresh data.
			// Namespace-level invalidation (utils.workspaces.invalidate()) may not
			// reliably reach all queries via trpc-electron IPC.
			await invalidateWorkspaceQueries(utils);

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
