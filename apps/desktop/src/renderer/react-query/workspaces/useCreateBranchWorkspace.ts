import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Mutation hook for creating a new branch workspace
 * Automatically invalidates all workspace queries on success
 * Adds a tab for the new workspace
 */
export function useCreateBranchWorkspace(
	options?: Parameters<
		typeof trpc.workspaces.createBranchWorkspace.useMutation
	>[0],
) {
	const utils = trpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);

	return trpc.workspaces.createBranchWorkspace.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Add a tab for the new workspace
			addTab(data.workspace.id);

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
