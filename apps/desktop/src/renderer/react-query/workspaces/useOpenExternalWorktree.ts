import { useNavigate } from "@tanstack/react-router";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import { bootstrapOpenWorktree } from "./bootstrap-open-worktree";

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
			await bootstrapOpenWorktree({
				data,
				invalidateWorkspaces: () => utils.workspaces.invalidate(),
				invalidateRecentProjects: () => utils.projects.getRecents.invalidate(),
				addTab,
				setTabAutoTitle,
				createOrAttach: (input) => createOrAttach.mutateAsync(input),
				writeToTerminal: (input) => writeToTerminal.mutateAsync(input),
				navigateToWorkspaceById: (workspaceId) =>
					navigateToWorkspace(workspaceId, navigate),
				logPrefix: "useOpenExternalWorktree",
			});

			await options?.onSuccess?.(data, ...rest);
		},
	});
}
