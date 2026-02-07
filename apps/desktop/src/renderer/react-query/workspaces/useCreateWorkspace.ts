import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

type MutationOptions = Parameters<
	typeof electronTrpc.workspaces.create.useMutation
>[0];

interface UseCreateWorkspaceOptions extends NonNullable<MutationOptions> {
	skipNavigation?: boolean;
}

export function useCreateWorkspace(options?: UseCreateWorkspaceOptions) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);
	const updateProgress = useWorkspaceInitStore((s) => s.updateProgress);

	return electronTrpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Set optimistic progress before navigation to prevent "Setup incomplete" flash
			if (data.isInitializing) {
				const optimisticProgress: WorkspaceInitProgress = {
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					step: "pending",
					message: "Preparing...",
				};
				updateProgress(optimisticProgress);
			}

			if (!data.wasExisting) {
				addPendingTerminalSetup({
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					initialCommands: data.initialCommands,
				});
			}

			await utils.workspaces.invalidate();

			if (!options?.skipNavigation) {
				navigateToWorkspace(data.workspace.id, navigate, { replace: true });
			}

			await options?.onSuccess?.(data, ...rest);
		},
	});
}
