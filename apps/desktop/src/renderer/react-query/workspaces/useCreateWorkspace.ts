import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Mutation hook for creating a new workspace
 * Automatically invalidates all workspace queries on success
 * Creates a terminal tab with setup commands if present
 */
export function useCreateWorkspace(
	options?: Parameters<typeof trpc.workspaces.create.useMutation>[0],
) {
	const utils = trpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);
	const createOrAttach = trpc.terminal.createOrAttach.useMutation();

	return trpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Create terminal tab with setup commands if present
			if (
				Array.isArray(data.initialCommands) &&
				data.initialCommands.length > 0
			) {
				const tabId = addTab(data.workspace.id);
				// Pre-create terminal session with initial commands
				// Terminal component will attach to this session when it mounts
				createOrAttach.mutate({
					tabId,
					workspaceId: data.workspace.id,
					tabTitle: "Terminal",
					initialCommands: data.initialCommands,
				});
			}

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
