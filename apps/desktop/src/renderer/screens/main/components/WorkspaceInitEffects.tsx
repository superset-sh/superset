import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	type PendingTerminalSetup,
	useWorkspaceInitStore,
} from "renderer/stores/workspace-init";
import { DEFAULT_AUTO_APPLY_DEFAULT_PRESET } from "shared/constants";

/** Mounted at app root to survive dialog unmounts. */
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
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const { openPreset } = useTabsWithPresets();
	const createOrAttach = useCreateOrAttachWithTheme();
	const utils = electronTrpc.useUtils();

	const handleTerminalSetup = useCallback(
		(setup: PendingTerminalSetup, onComplete: () => void) => {
			const hasSetupScript =
				Array.isArray(setup.initialCommands) &&
				setup.initialCommands.length > 0;
			const presets = (setup.defaultPresets ?? []).filter(
				(p) => p.commands.length > 0,
			);
			const hasPresets = shouldApplyPreset && presets.length > 0;
			const { agentCommand } = setup;

			if (hasSetupScript && hasPresets) {
				const { tabId: setupTabId, paneId: setupPaneId } = addTab(
					setup.workspaceId,
				);
				setTabAutoTitle(setupTabId, "Workspace Setup");
				for (const preset of presets) {
					openPreset(setup.workspaceId, preset);
				}

				if (agentCommand) {
					addPane(setupTabId, {
						initialCommands: [agentCommand],
					});
				}

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

				if (agentCommand) {
					addPane(tabId, {
						initialCommands: [agentCommand],
					});
				}

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

			if (hasPresets) {
				for (const preset of presets) {
					openPreset(setup.workspaceId, preset);
				}
				if (agentCommand) {
					const { tabId: agentTabId } = addTab(setup.workspaceId, {
						initialCommands: [agentCommand],
					});
					setTabAutoTitle(agentTabId, "Agent");
				}
				onComplete();
				return;
			}

			if (agentCommand) {
				const { tabId: agentTabId } = addTab(setup.workspaceId, {
					initialCommands: [agentCommand],
				});
				setTabAutoTitle(agentTabId, "Agent");
				onComplete();
				return;
			}

			onComplete();
		},
		[
			addTab,
			addPane,
			setTabAutoTitle,
			createOrAttach,
			openPreset,
			shouldApplyPreset,
		],
	);

	useEffect(() => {
		for (const [workspaceId, setup] of Object.entries(pendingTerminalSetups)) {
			const progress = initProgress[workspaceId];

			if (processingRef.current.has(workspaceId)) {
				continue;
			}

			if (!progress) {
				processingRef.current.add(workspaceId);
				handleTerminalSetup(setup, () => {
					removePendingTerminalSetup(workspaceId);
					processingRef.current.delete(workspaceId);
				});
				continue;
			}

			if (progress?.step === "ready") {
				processingRef.current.add(workspaceId);

				// Always fetch from backend to ensure we have the latest preset
				// (client-side preset query may not have resolved when pending setup was created)
				if (setup.defaultPresets === undefined) {
					utils.workspaces.getSetupCommands
						.fetch({ workspaceId })
						.then((setupData) => {
							const completeSetup: PendingTerminalSetup = {
								...setup,
								defaultPresets: setupData?.defaultPresets ?? [],
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
						defaultPresets: setupData.defaultPresets ?? [],
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
