import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenConfigModal } from "renderer/stores/config-modal";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { AddTabWithMultiplePanesOptions } from "renderer/stores/tabs/types";
import {
	type PendingTerminalSetup,
	useWorkspaceInitStore,
} from "renderer/stores/workspace-init";
import { DEFAULT_AUTO_APPLY_DEFAULT_PRESET } from "shared/constants";

/**
 * Handles terminal setup when workspaces become ready.
 * Mounted at app root to survive dialog unmounts.
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

	const { data: autoApplyDefaultPreset } =
		electronTrpc.settings.getAutoApplyDefaultPreset.useQuery();
	const shouldApplyPreset =
		autoApplyDefaultPreset ?? DEFAULT_AUTO_APPLY_DEFAULT_PRESET;

	const processingRef = useRef<Set<string>>(new Set());

	const addTab = useTabsStore((state) => state.addTab);
	const addPane = useTabsStore((state) => state.addPane);
	const addPanesToTab = useTabsStore((state) => state.addPanesToTab);
	const addTabWithMultiplePanes = useTabsStore(
		(state) => state.addTabWithMultiplePanes,
	);
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const renameTab = useTabsStore((state) => state.renameTab);
	const createOrAttach = electronTrpc.terminal.createOrAttach.useMutation();
	const openConfigModal = useOpenConfigModal();
	const dismissConfigToast =
		electronTrpc.config.dismissConfigToast.useMutation();
	const utils = electronTrpc.useUtils();

	const createPresetTerminal = useCallback(
		(
			workspaceId: string,
			preset: NonNullable<PendingTerminalSetup["defaultPreset"]>,
			existingTabId?: string,
		) => {
			const isParallel =
				preset.executionMode === "parallel" && preset.commands.length > 1;

			if (existingTabId) {
				if (isParallel) {
					addPanesToTab(existingTabId, {
						commands: preset.commands,
						initialCwd: preset.cwd || undefined,
					});
				} else {
					addPane(existingTabId, {
						initialCommands: preset.commands,
						initialCwd: preset.cwd || undefined,
					});
				}
				return;
			}

			if (isParallel) {
				const options: AddTabWithMultiplePanesOptions = {
					commands: preset.commands,
					initialCwd: preset.cwd || undefined,
				};
				const { tabId } = addTabWithMultiplePanes(workspaceId, options);
				renameTab(tabId, preset.name);
			} else {
				const { tabId } = addTab(workspaceId, {
					initialCommands: preset.commands,
					initialCwd: preset.cwd || undefined,
				});
				renameTab(tabId, preset.name);
			}
		},
		[addTab, addPane, addPanesToTab, addTabWithMultiplePanes, renameTab],
	);

	const handleTerminalSetup = useCallback(
		(setup: PendingTerminalSetup, onComplete: () => void) => {
			const hasSetupScript =
				Array.isArray(setup.initialCommands) &&
				setup.initialCommands.length > 0;
			const hasDefaultPreset =
				shouldApplyPreset &&
				setup.defaultPreset != null &&
				setup.defaultPreset.commands.length > 0;

			if (hasSetupScript && hasDefaultPreset && setup.defaultPreset) {
				const { tabId: setupTabId, paneId: setupPaneId } = addTab(
					setup.workspaceId,
				);
				setTabAutoTitle(setupTabId, "Workspace Setup");
				createPresetTerminal(
					setup.workspaceId,
					setup.defaultPreset,
					setupTabId,
				);

				createOrAttach.mutate(
					{
						paneId: setupPaneId,
						tabId: setupTabId,
						workspaceId: setup.workspaceId,
						initialCommands: setup.initialCommands ?? undefined,
					},
					{
						onSuccess: () => onComplete(),
						onError: (error) => {
							console.error(
								"[WorkspaceInitEffects] Failed to create terminal:",
								error,
							);
							toast.error("Failed to create terminal", {
								description:
									error.message || "Terminal setup failed. Please try again.",
							});
							onComplete();
						},
					},
				);
				return;
			}

			if (hasSetupScript) {
				const { tabId, paneId } = addTab(setup.workspaceId);
				setTabAutoTitle(tabId, "Workspace Setup");
				createOrAttach.mutate(
					{
						paneId,
						tabId,
						workspaceId: setup.workspaceId,
						initialCommands: setup.initialCommands ?? undefined,
					},
					{
						onSuccess: () => onComplete(),
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
							onComplete();
						},
					},
				);
				return;
			}

			if (
				shouldApplyPreset &&
				setup.defaultPreset &&
				setup.defaultPreset.commands.length > 0
			) {
				createPresetTerminal(setup.workspaceId, setup.defaultPreset);
				onComplete();
				return;
			}

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
		},
		[
			addTab,
			setTabAutoTitle,
			createOrAttach,
			openConfigModal,
			dismissConfigToast,
			createPresetTerminal,
			shouldApplyPreset,
		],
	);

	useEffect(() => {
		for (const [workspaceId, setup] of Object.entries(pendingTerminalSetups)) {
			const progress = initProgress[workspaceId];

			if (processingRef.current.has(workspaceId)) {
				continue;
			}

			if (progress?.step === "ready") {
				processingRef.current.add(workspaceId);

				// Always fetch from backend to ensure we have the latest preset
				// (client-side preset query may not have resolved when pending setup was created)
				if (setup.defaultPreset === undefined) {
					utils.workspaces.getSetupCommands
						.fetch({ workspaceId })
						.then((setupData) => {
							const completeSetup: PendingTerminalSetup = {
								...setup,
								defaultPreset: setupData?.defaultPreset ?? null,
							};
							handleTerminalSetup(completeSetup, () => {
								removePendingTerminalSetup(workspaceId);
								clearProgress(workspaceId);
								processingRef.current.delete(workspaceId);
							});
						})
						.catch((error) => {
							console.error(
								"[WorkspaceInitEffects] Failed to fetch setup commands:",
								error,
							);
							handleTerminalSetup(setup, () => {
								removePendingTerminalSetup(workspaceId);
								clearProgress(workspaceId);
								processingRef.current.delete(workspaceId);
							});
						});
				} else {
					handleTerminalSetup(setup, () => {
						removePendingTerminalSetup(workspaceId);
						clearProgress(workspaceId);
						processingRef.current.delete(workspaceId);
					});
				}
			}

			if (progress?.step === "failed") {
				removePendingTerminalSetup(workspaceId);
			}
		}

		// Handle workspaces that became ready without pending setup data (after retry or app restart)
		for (const [workspaceId, progress] of Object.entries(initProgress)) {
			if (progress.step !== "ready") {
				continue;
			}
			if (pendingTerminalSetups[workspaceId]) {
				continue;
			}
			if (processingRef.current.has(workspaceId)) {
				continue;
			}

			processingRef.current.add(workspaceId);

			utils.workspaces.getSetupCommands
				.fetch({ workspaceId })
				.then((setupData) => {
					if (!setupData) {
						clearProgress(workspaceId);
						processingRef.current.delete(workspaceId);
						return;
					}

					const fetchedSetup: PendingTerminalSetup = {
						workspaceId,
						projectId: setupData.projectId,
						initialCommands: setupData.initialCommands,
						defaultPreset: setupData.defaultPreset,
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

	return null;
}
