import { toast } from "@superset/ui/sonner";
import { trpc } from "renderer/lib/trpc";
import { useOpenConfigModal } from "renderer/stores/config-modal";
import { useTabsStore } from "renderer/stores/tabs/store";

/**
 * Mutation hook for creating a new workspace
 * Automatically invalidates all workspace queries on success
 * Creates a terminal tab with setup commands if present
 * Shows config toast if no setup commands are configured
 */
export function useCreateWorkspace(
	options?: Parameters<typeof trpc.workspaces.create.useMutation>[0],
) {
	const utils = trpc.useUtils();
	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = trpc.terminal.createOrAttach.useMutation();
	const openConfigModal = useOpenConfigModal();
	const dismissConfigToast = trpc.config.dismissConfigToast.useMutation();

	return trpc.workspaces.create.useMutation({
		...options,
		onSuccess: async (data, ...rest) => {
			// Auto-invalidate all workspace queries
			await utils.workspaces.invalidate();

			// Create terminal tab with setup commands if present
			if (
				Array.isArray(data.initialCommands) &&
				data.initialCommands.length > 0
			) {
				const { tabId, paneId } = addTab(data.workspace.id);
				setTabAutoTitle(tabId, "Workspace Setup");
				// Pre-create terminal session with initial commands
				// Terminal component will attach to this session when it mounts
				createOrAttach.mutate({
					paneId,
					tabId,
					workspaceId: data.workspace.id,
					initialCommands: data.initialCommands,
				});
			} else {
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

			// Call user's onSuccess if provided
			await options?.onSuccess?.(data, ...rest);
		},
	});
}
