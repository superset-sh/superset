import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for opening a new project
 * Automatically invalidates workspace queries on success
 */
export function useOpenProject(
	options?: Parameters<typeof trpc.projects.openProject.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.projects.openProject.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate workspace queries
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
