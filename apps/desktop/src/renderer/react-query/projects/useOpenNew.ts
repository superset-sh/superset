import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for opening a new project
 * Creates a Project record if it doesn't exist
 */
export function useOpenNew(
	options?: Parameters<typeof trpc.projects.openNew.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.projects.openNew.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate projects query
			await utils.projects.getRecents.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
