import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for setting a workspace's auto-generated name.
 * Only updates if the workspace name hasn't been customized (still equals branch name).
 * Automatically invalidates all workspace queries on success.
 */
export function useSetWorkspaceAutoName(
	options?: Parameters<typeof trpc.workspaces.setAutoName.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.setAutoName.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Only invalidate if the update was actually applied
			if (args[0].success) {
				await utils.workspaces.invalidate();
			}

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
