import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for updating a tab (title, needsAttention, etc.)
 * Automatically invalidates tabs queries on success
 */
export function useUpdateTab(
	options?: Parameters<typeof trpc.tabs.update.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.update.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate tab queries
			await utils.tabs.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
