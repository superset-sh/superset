import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
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
 *
 * Also handles the case where pending setup data is lost (e.g., after retry
 * or app restart) by fetching setup commands from the backend on demand.
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

	// Track which setups are currently being processed to prevent duplicate handling
	const processingRef = useRef<Set<string>>(new Set());

	const addTab = useTabsStore((state) => state.addTab);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const createOrAttach = trpc.terminal.createOrAttach.useMutation();
	const openConfigModal = useOpenConfigModal();
	const dismissConfigToast = trpc.config.dismissConfigToast.useMutation();
	const utils = trpc.useUtils();

	// Helper to create terminal with setup commands
	const handleTerminalSetup = useCallback(
		(setup: PendingTerminalSetup, onComplete: () => void) => {
			if (
				Array.isArray(setup.initialCommands) &&
				setup.initialCommands.length > 0
			) {
				const { tabId, paneId } = addTab(setup.workspaceId);
				setTabAutoTitle(tabId, "Workspace Setup");
				createOrAttach.mutate(
					{
						paneId,
						tabId,
						workspaceId: setup.workspaceId,
						initialCommands: setup.initialCommands,
					},
					{
						onSuccess: () => {
							onComplete();
						},
						onError: (error) => {
							console.error(
								"[WorkspaceInitEffects] Failed to create terminal:",
								error,
							);
							toast.error("Failed to create terminal", {
								description:
									error.message || "Terminal setup failed. Please try again.",
								action: {
									label: "Open Terminal",
									onClick: () => {
										// Allow user to manually trigger terminal creation
										const { tabId: newTabId, paneId: newPaneId } = addTab(
											setup.workspaceId,
										);
										createOrAttach.mutate({
											paneId: newPaneId,
											tabId: newTabId,
											workspaceId: setup.workspaceId,
											initialCommands: setup.initialCommands ?? undefined,
										});
									},
								},
							});
							// Still complete to prevent infinite retries
							onComplete();
						},
					},
				);
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
				onComplete();
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
		// Process pending setups that have reached ready state
		for (const [workspaceId, setup] of Object.entries(pendingTerminalSetups)) {
			const progress = initProgress[workspaceId];

			// Skip if already being processed
			if (processingRef.current.has(workspaceId)) {
				continue;
			}

			// Create terminal when workspace becomes ready
			if (progress?.step === "ready") {
				// Mark as processing to prevent duplicate handling
				processingRef.current.add(workspaceId);

				handleTerminalSetup(setup, () => {
					// Only remove from pending after successful handling
					removePendingTerminalSetup(workspaceId);
					clearProgress(workspaceId);
					processingRef.current.delete(workspaceId);
				});
			}

			// Clean up pending if failed (user will use retry or delete)
			// Note: losing pending data is OK now - we fetch on demand when ready
			if (progress?.step === "failed") {
				removePendingTerminalSetup(workspaceId);
			}
		}

		// Handle workspaces that became ready without pending setup data
		// (e.g., after retry or app restart during init)
		for (const [workspaceId, progress] of Object.entries(initProgress)) {
			// Only process ready workspaces that don't have pending setup
			if (progress.step !== "ready") {
				continue;
			}
			if (pendingTerminalSetups[workspaceId]) {
				continue; // Already handled above
			}
			if (processingRef.current.has(workspaceId)) {
				continue;
			}

			// Mark as processing and fetch setup commands from backend
			processingRef.current.add(workspaceId);

			utils.workspaces.getSetupCommands
				.fetch({ workspaceId })
				.then((setupData) => {
					if (!setupData) {
						// Workspace not found or no project - just clear progress
						clearProgress(workspaceId);
						processingRef.current.delete(workspaceId);
						return;
					}

					// Create a pending setup from fetched data and handle it
					const fetchedSetup: PendingTerminalSetup = {
						workspaceId,
						projectId: setupData.projectId,
						initialCommands: setupData.initialCommands,
					};

					handleTerminalSetup(fetchedSetup, () => {
						clearProgress(workspaceId);
						processingRef.current.delete(workspaceId);
					});
				})
				.catch((error) => {
					console.error(
						"[WorkspaceInitEffects] Failed to fetch setup commands:",
						error,
					);
					// Still clear progress to avoid being stuck
					clearProgress(workspaceId);
					processingRef.current.delete(workspaceId);
				});
		}
	}, [
		initProgress,
		pendingTerminalSetups,
		removePendingTerminalSetup,
		clearProgress,
		handleTerminalSetup,
		utils.workspaces.getSetupCommands,
	]);

	// Renderless component
	return null;
}
