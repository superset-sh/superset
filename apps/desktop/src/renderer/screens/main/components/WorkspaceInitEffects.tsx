import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect } from "react";
import { trpc } from "renderer/lib/trpc";
import { useOpenConfigModal } from "renderer/stores/config-modal";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	type PendingTerminalSetup,
	useWorkspaceInitStore,
} from "renderer/stores/workspace-init";

/**
 * Renderless component that handles terminal setup when workspaces become ready.
 *
 * This is mounted at the app root (MainScreen) so it survives dialog unmounts.
 * When a workspace creation is initiated from a dialog (e.g., InitGitDialog,
 * CloneRepoDialog), the dialog may close before initialization completes.
 * This component ensures the terminal is still created when the workspace
 * becomes ready.
 */
export function WorkspaceInitEffects() {
	const initProgress = useWorkspaceInitStore((s) => s.initProgress);
	const pendingTerminalSetups = useWorkspaceInitStore(
		(s) => s.pendingTerminalSetups,
	);
	const removePendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.removePendingTerminalSetup,
	);
	const clearProgress = useWorkspaceInitStore((s) => s.clearProgress);

	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = trpc.terminal.createOrAttach.useMutation();
	const openConfigModal = useOpenConfigModal();
	const dismissConfigToast = trpc.config.dismissConfigToast.useMutation();

	// Helper to create terminal with setup commands
	const handleTerminalSetup = useCallback(
		(setup: PendingTerminalSetup) => {
			if (
				Array.isArray(setup.initialCommands) &&
				setup.initialCommands.length > 0
			) {
				const { tabId, paneId } = addTab(setup.workspaceId);
				setTabAutoTitle(tabId, "Workspace Setup");
				createOrAttach.mutate({
					paneId,
					tabId,
					workspaceId: setup.workspaceId,
					initialCommands: setup.initialCommands,
				});
			} else {
				// Show config toast if no setup commands
				toast.info("No setup script configured", {
					description: "Automate workspace setup with a config.json file",
					action: {
						label: "Configure",
						onClick: () => openConfigModal(setup.projectId),
					},
					onDismiss: () => {
						dismissConfigToast.mutate({ projectId: setup.projectId });
					},
				});
			}
		},
		[
			addTab,
			setTabAutoTitle,
			createOrAttach,
			openConfigModal,
			dismissConfigToast,
		],
	);

	useEffect(() => {
		// Process all pending setups
		for (const [workspaceId, setup] of Object.entries(pendingTerminalSetups)) {
			const progress = initProgress[workspaceId];

			// Create terminal when workspace becomes ready
			if (progress?.step === "ready") {
				// Remove from pending FIRST to prevent duplicate processing
				removePendingTerminalSetup(workspaceId);

				handleTerminalSetup(setup);

				// Clear progress after handling
				clearProgress(workspaceId);
			}

			// Clean up pending if failed (user will use retry or delete)
			if (progress?.step === "failed") {
				removePendingTerminalSetup(workspaceId);
			}
		}
	}, [
		initProgress,
		pendingTerminalSetups,
		removePendingTerminalSetup,
		clearProgress,
		handleTerminalSetup,
	]);

	// Renderless component
	return null;
}
