import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for removing a recent project
 * Automatically invalidates recent projects query on success
 */
export function useRemoveRecent(
	options?: Parameters<typeof trpc.projects.removeRecent.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.projects.removeRecent.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate recent projects query
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
