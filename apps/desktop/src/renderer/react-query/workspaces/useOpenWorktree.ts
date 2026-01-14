import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useOpenConfigModal } from "renderer/stores/config-modal";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Mutation hook for opening an existing worktree as a new workspace
 * Automatically invalidates all workspace queries on success
 * Creates a terminal tab with setup commands if present
 * Shows config toast if no setup commands are configured
 */
export function useOpenWorktree(
	options?: Parameters<typeof trpc.workspaces.openWorktree.useMutation>[0],
) {
	const navigate = useNavigate();
	const utils = trpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = trpc.terminal.createOrAttach.useMutation();
	const openConfigModal = useOpenConfigModal();
	const dismissConfigToast = trpc.config.dismissConfigToast.useMutation();

	return trpc.workspaces.openWorktree.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();
			// Invalidate project queries since openWorktree updates project metadata
			await utils.projects.getRecents.invalidate();

			const initialCommands =
				Array.isArray(data.initialCommands) && data.initialCommands.length > 0
					? data.initialCommands
					: undefined;

			// Always create a terminal tab when opening a worktree
			const { tabId, paneId } = addTab(data.workspace.id);
			if (initialCommands) {
				setTabAutoTitle(tabId, "Workspace Setup");
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
