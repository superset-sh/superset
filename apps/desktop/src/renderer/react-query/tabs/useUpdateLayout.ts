import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for updating a group tab's layout
 * Automatically invalidates tabs and workspace queries on success
 */
export function useUpdateLayout(
	options?: Parameters<typeof trpc.tabs.updateLayout.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.updateLayout.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate tab and workspace queries
			// (workspace activeTabId might change if a child tab was removed)
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
