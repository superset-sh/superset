import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

type MutationOptions = Parameters<
	typeof electronTrpc.workspaces.createFromPr.useMutation
>[0];

export function useCreateFromPr(options?: MutationOptions) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);
	const updateProgress = useWorkspaceInitStore((s) => s.updateProgress);

	return electronTrpc.workspaces.createFromPr.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			if (!data.wasExisting && data.initialCommands) {
				const optimisticProgress: WorkspaceInitProgress = {
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					step: "pending",
					message: "Preparing...",
				};
				updateProgress(optimisticProgress);
			}

			if (data.initialCommands) {
				addPendingTerminalSetup({
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					initialCommands: data.initialCommands,
				});
			}

			await utils.workspaces.invalidate();

			navigateToWorkspace(data.workspace.id, navigate);

			await options?.onSuccess?.(data, ...rest);
		},
	});
}
