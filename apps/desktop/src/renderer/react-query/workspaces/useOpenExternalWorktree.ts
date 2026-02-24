import { useNavigate } from "@tanstack/react-router";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";

export function useOpenExternalWorktree(
	options?: Parameters<
		typeof electronTrpc.workspaces.openExternalWorktree.useMutation
	>[0],
) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = useCreateOrAttachWithTheme();
	const writeToTerminal = electronTrpc.terminal.write.useMutation();

	return electronTrpc.workspaces.openExternalWorktree.useMutation({
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
			try {
				await createOrAttach.mutateAsync({
					paneId,
					tabId,
					workspaceId: data.workspace.id,
				});
				if (initialCommands) {
					await writeToTerminal.mutateAsync({
						paneId,
						data: `${initialCommands.join(" && ")}\n`,
						throwOnError: true,
					});
				}
			} catch (error) {
				console.error(
					"[useOpenExternalWorktree] Failed to bootstrap terminal:",
					error,
				);
			}

			navigateToWorkspace(data.workspace.id, navigate);

			await options?.onSuccess?.(data, ...rest);
		},
	});
}
