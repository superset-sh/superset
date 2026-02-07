import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Mutation hook for opening an existing worktree as a new workspace
 * Automatically invalidates all workspace queries on success
 * Creates a terminal tab with setup commands if present
 */
export function useOpenWorktree(
	options?: Parameters<
		typeof electronTrpc.workspaces.openWorktree.useMutation
	>[0],
) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = electronTrpc.terminal.createOrAttach.useMutation();

	return electronTrpc.workspaces.openWorktree.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			await utils.workspaces.invalidate();
			await utils.projects.getRecents.invalidate();

			const initialCommands =
				Array.isArray(data.initialCommands) && data.initialCommands.length > 0
					? data.initialCommands
					: undefined;

			const { tabId, paneId } = addTab(data.workspace.id);
			if (initialCommands) {
				setTabAutoTitle(tabId, "Workspace Setup");
			}
			createOrAttach.mutate({
				paneId,
				tabId,
				workspaceId: data.workspace.id,
				initialCommands,
			});

			navigateToWorkspace(data.workspace.id, navigate);

			await options?.onSuccess?.(data, ...rest);
		},
	});
}
