import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	useClearPendingWorkspace,
	useSetPendingWorkspace,
} from "renderer/stores/new-workspace-modal";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

export function useOpenMainRepoWorkspace(
	options?: Parameters<
		typeof electronTrpc.workspaces.openMainRepoWorkspace.useMutation
	>[0],
) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);
	const updateProgress = useWorkspaceInitStore((s) => s.updateProgress);
	const setPendingWorkspace = useSetPendingWorkspace();
	const clearPendingWorkspace = useClearPendingWorkspace();

	return electronTrpc.workspaces.openMainRepoWorkspace.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			await utils.workspaces.invalidate();
			ensureWorkspaceInSidebar(data.workspace.id, data.projectId);

			// Set pending workspace to show in sidebar while Electric sync completes
			// This ensures the workspace appears immediately in the sidebar
			if (!data.wasExisting) {
				setPendingWorkspace({
					id: data.workspace.id,
					projectId: data.projectId,
					name: data.workspace.name || data.workspace.branch,
					status: "creating",
				});

				let setupData = null;
				try {
					setupData = await utils.workspaces.getSetupCommands.fetch({
						workspaceId: data.workspace.id,
					});
				} catch (error) {
					console.error(
						"[useOpenMainRepoWorkspace] Failed to fetch setup commands:",
						error,
					);
				}

				addPendingTerminalSetup({
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					initialCommands: setupData?.initialCommands ?? null,
					defaultPresets: setupData?.defaultPresets ?? [],
				});

				// Branch workspaces skip git init, so mark ready immediately to trigger terminal setup
				const readyProgress: WorkspaceInitProgress = {
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					step: "ready",
					message: "Ready",
				};
				updateProgress(readyProgress);

				// Clear pending workspace after a short delay to allow Electric sync to complete
				// The Electric sync should bring the real workspace data into sidebarWorkspaces
				setTimeout(() => {
					clearPendingWorkspace(data.workspace.id);
				}, 2000);
			}

			navigateToWorkspace(data.workspace.id, navigate);
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
