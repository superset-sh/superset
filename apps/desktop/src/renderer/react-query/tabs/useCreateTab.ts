import { trpc } from "renderer/lib/trpc";

/**
 * Mutation hook for creating a new tab
 * Automatically invalidates tabs and workspace queries on success
 */
export function useCreateTab(
	options?: Parameters<typeof trpc.tabs.create.useMutation>[0],
) {
	const utils = trpc.useUtils();

	return trpc.tabs.create.useMutation({
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
