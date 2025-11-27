import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Mutation hook for creating a new workspace
 * Automatically invalidates all workspace queries on success
 * Creates a setup tab if setup commands are present
 */
export function useCreateWorkspace(
	options?: Parameters<typeof trpc.workspaces.create.useMutation>[0],
) {
	const utils = trpc.useUtils();
	const addSetupTab = useTabsStore((state) => state.addSetupTab);

	return trpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Create setup tab if setup commands are present and is an array
			if (Array.isArray(data.setupConfig) && data.setupConfig.length > 0) {
				addSetupTab(
					data.workspace.id,
					data.setupConfig,
					data.worktreePath,
					data.setupCopyResults ?? undefined,
				);
			}

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
