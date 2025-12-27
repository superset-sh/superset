import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for closing a project (hides from tabs, keeps worktrees on disk)
 * Automatically invalidates all workspace and project queries on success
 */
export function useCloseProject(
	options?: Parameters<typeof trpc.projects.close.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.projects.close.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();
			// Invalidate project queries since close updates project metadata
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
