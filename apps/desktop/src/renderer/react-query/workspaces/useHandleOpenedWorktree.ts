import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import { bootstrapOpenWorktree } from "./bootstrap-open-worktree";

interface OpenedWorktreeData {
	workspace: { id: string };
	initialCommands?: string[] | null;
}

export function useHandleOpenedWorktree() {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = useCreateOrAttachWithTheme();
	const writeToTerminal = electronTrpc.terminal.write.useMutation();

	return useCallback(
		async (data: OpenedWorktreeData) => {
			await utils.workspaces.invalidate();
			await utils.projects.getRecents.invalidate();

			const bootstrapError = await bootstrapOpenWorktree({
				data,
				addTab,
				setTabAutoTitle,
				createOrAttach: (input) => createOrAttach.mutateAsync(input),
				writeToTerminal: (input) => writeToTerminal.mutateAsync(input),
			});
			if (bootstrapError === "create_or_attach_failed") {
				toast.error("Workspace opened, but terminal failed to start.");
			}
			if (bootstrapError === "write_initial_commands_failed") {
				toast.error("Workspace opened, but setup command failed.");
			}

			navigateToWorkspace(data.workspace.id, navigate);
		},
		[
			addTab,
			createOrAttach,
			navigate,
			setTabAutoTitle,
			utils.projects.getRecents,
			utils.workspaces,
			writeToTerminal,
		],
	);
}
