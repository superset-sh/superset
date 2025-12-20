import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Mutation hook for creating a new branch workspace
 * Automatically invalidates all workspace queries on success
 * Adds a tab for newly created workspaces (not existing ones)
 */
export function useCreateBranchWorkspace(
	options?: Parameters<
		typeof trpc.workspaces.createBranchWorkspace.useMutation
	>[0],
) {
	const utils = trpc.useUtils();

	return trpc.workspaces.createBranchWorkspace.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Only add a tab for newly created workspaces (not existing ones being activated)
			// The store's addTab is idempotent, so duplicate calls are safe
			if (!data.wasExisting) {
				useTabsStore.getState().addTab(data.workspace.id);
			}

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
