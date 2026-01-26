import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

export function useCreateBranchWorkspace(
	options?: Parameters<
		typeof electronTrpc.workspaces.createBranchWorkspace.useMutation
	>[0],
) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);
	const updateProgress = useWorkspaceInitStore((s) => s.updateProgress);
	const { data: defaultPreset } =
		electronTrpc.settings.getDefaultPreset.useQuery();

	return electronTrpc.workspaces.createBranchWorkspace.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			await utils.workspaces.invalidate();

			if (!data.wasExisting) {
				const setupData = await utils.workspaces.getSetupCommands.fetch({
					workspaceId: data.workspace.id,
				});

				addPendingTerminalSetup({
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					initialCommands: setupData?.initialCommands ?? null,
					defaultPreset: defaultPreset ?? setupData?.defaultPreset ?? null,
				});

				// Branch workspaces skip git init, so mark ready immediately to trigger terminal setup
				const readyProgress: WorkspaceInitProgress = {
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					step: "ready",
					message: "Ready",
				};
				updateProgress(readyProgress);
			}

			navigateToWorkspace(data.workspace.id, navigate);
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
