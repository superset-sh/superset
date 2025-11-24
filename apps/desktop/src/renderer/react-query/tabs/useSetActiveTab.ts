import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for setting the active tab
 * Automatically invalidates tabs and workspace queries on success
 */
export function useSetActiveTab(
	options?: Parameters<typeof trpc.tabs.setActive.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.setActive.useMutation({
		...options,
		onSuccess: async (...args) => {
			// Auto-invalidate tab and workspace queries (both are affected)
			await utils.tabs.invalidate();
			await utils.workspaces.invalidate();

			// Call user's onSuccess if provided
			await options?.onSuccess?.(...args);
		},
	});
}
