import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useOpenConfigModal } from "renderer/stores/config-modal";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";

/**
 * Mutation hook for opening an existing worktree as a new workspace
 * Automatically invalidates all workspace queries on success
 * Creates a terminal tab with setup commands if present
 * Shows config toast if no setup commands are configured
 */
export function useOpenWorktree(
	options?: Parameters<
		typeof electronTrpc.workspaces.openWorktree.useMutation
	>[0],
) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const { addTab, defaultPreset } = useTabsWithPresets();
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = electronTrpc.terminal.createOrAttach.useMutation();
	const openConfigModal = useOpenConfigModal();
	const dismissConfigToast =
		electronTrpc.config.dismissConfigToast.useMutation();

	return electronTrpc.workspaces.openWorktree.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();
			// Invalidate project queries since openWorktree updates project metadata
			await utils.projects.getRecents.invalidate();

			// Merge setup commands with preset commands (setup runs first, then preset)
			const setupCommands =
				Array.isArray(data.initialCommands) && data.initialCommands.length > 0
					? data.initialCommands
					: [];
			const presetCommands = defaultPreset?.commands ?? [];
			const combinedCommands = [...setupCommands, ...presetCommands];
			const initialCommands =
				combinedCommands.length > 0 ? combinedCommands : undefined;
			const initialCwd = defaultPreset?.cwd || undefined;

			// Always create a terminal tab when opening a worktree
			// Pass combined commands explicitly so preset is not applied again
			const { tabId, paneId } = addTab(data.workspace.id, {
				initialCommands,
				initialCwd,
			});
			if (initialCommands) {
				setTabAutoTitle(
					tabId,
					setupCommands.length > 0
						? "Workspace Setup"
						: defaultPreset?.name || "Terminal",
				);
			}
			// Pre-create terminal session (with initial commands if present)
			// Terminal component will attach to this session when it mounts
			createOrAttach.mutate({
				paneId,
				tabId,
				workspaceId: data.workspace.id,
				initialCommands,
			});

			if (!initialCommands) {
				// Show config toast if no setup commands
				toast.info("No setup script configured", {
					description: "Automate workspace setup with a config.json file",
					action: {
						label: "Configure",
						onClick: () => openConfigModal(data.projectId),
					},
					onDismiss: () => {
						dismissConfigToast.mutate({ projectId: data.projectId });
					},
				});
			}

			// Navigate to the opened workspace
			navigateToWorkspace(data.workspace.id, navigate);

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
