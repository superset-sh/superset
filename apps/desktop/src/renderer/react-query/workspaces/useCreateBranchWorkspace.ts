import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";

/**
 * Mutation hook for creating a new branch workspace
 * Automatically invalidates all workspace queries on success
 * Routes through WorkspaceInitEffects for terminal setup (including default preset)
 */
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

	// Query default preset to include in terminal setup
	const { data: defaultPreset } =
		electronTrpc.settings.getDefaultPreset.useQuery();

	return electronTrpc.workspaces.createBranchWorkspace.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// For newly created branch workspaces, route through WorkspaceInitEffects
			// for terminal setup (including setup script and default preset)
			if (!data.wasExisting) {
				// Fetch setup commands from backend
				const setupData = await utils.workspaces.getSetupCommands.fetch({
					workspaceId: data.workspace.id,
				});

				// Add to pending terminal setups
				addPendingTerminalSetup({
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					initialCommands: setupData?.initialCommands ?? null,
					defaultPreset: defaultPreset ?? setupData?.defaultPreset ?? null,
				});

				// Set synthetic "ready" progress immediately (branch workspaces don't need git init)
				// This triggers WorkspaceInitEffects to process the terminal setup
				const readyProgress: WorkspaceInitProgress = {
					workspaceId: data.workspace.id,
					projectId: data.projectId,
					step: "ready",
					message: "Ready",
				};
				updateProgress(readyProgress);
			}

			// Navigate to the workspace
			navigateToWorkspace(data.workspace.id, navigate);

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
