import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for opening a recent project
 * Automatically invalidates workspace queries on success
 */
export function useOpenRecent(
	options?: Parameters<typeof trpc.projects.openRecent.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.projects.openRecent.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate workspace queries
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
