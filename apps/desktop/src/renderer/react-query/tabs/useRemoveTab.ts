import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for removing a tab
 * Automatically invalidates tabs and workspace queries on success
 */
export function useRemoveTab(
	options?: Parameters<typeof trpc.tabs.remove.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.remove.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate tab and workspace queries
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
