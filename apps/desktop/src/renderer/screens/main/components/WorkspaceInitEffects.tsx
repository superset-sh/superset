import {
	type AgentLaunchRequest,
	normalizeAgentLaunchRequest,
} from "@superset/shared/agent-launch";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { writeCommandsInPane } from "renderer/lib/terminal/launch-command";
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
	const setTabAutoTitle = useTabsStore((state) => state.setTabAutoTitle);
	const { openPreset } = useTabsWithPresets();
	const createOrAttach = useCreateOrAttachWithTheme();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const utils = electronTrpc.useUtils();

	const openPresetsInActiveTab = useCallback(
		(workspaceId: string, presets: PendingTerminalSetup["defaultPresets"]) => {
			for (const preset of presets ?? []) {
				if (preset.commands.length === 0) continue;
				openPreset(workspaceId, preset, { target: "active-tab" });
			}
		},
		[openPreset],
	);

	const resolveSetupLaunchRequest = useCallback(
		(setup: PendingTerminalSetup): AgentLaunchRequest | null => {
			if (setup.agentLaunchRequest) {
				return normalizeAgentLaunchRequest(setup.agentLaunchRequest);
			}
			if (setup.agentCommand) {
				return normalizeAgentLaunchRequest({
					workspaceId: setup.workspaceId,
					command: setup.agentCommand,
					name: "Agent",
					source: "workspace-init",
				});
			}
			return null;
		},
		[],
	);

	const launchAgentViaOrchestrator = useCallback(
		(setup: PendingTerminalSetup, targetPaneId?: string) => {
			let request: AgentLaunchRequest;
			try {
				const resolved = resolveSetupLaunchRequest(setup);
				if (!resolved) return false;
				request =
					targetPaneId &&
					resolved.kind === "terminal" &&
					!resolved.terminal.paneId
						? {
								...resolved,
								terminal: {
									...resolved.terminal,
									paneId: targetPaneId,
								},
							}
						: resolved;
			} catch (error) {
				console.error(
					"[WorkspaceInitEffects] Invalid launch request in pending setup:",
					error,
				);
				toast.error("Failed to start agent", {
					description:
						error instanceof Error
							? error.message
							: "Invalid launch request in workspace setup.",
				});
				return true;
			}

			void launchAgentSession(request, {
				source: "workspace-init",
				createOrAttach: (input) => terminalCreateOrAttach.mutateAsync(input),
				write: (input) => terminalWrite.mutateAsync(input),
			}).then((result) => {
				if (result.status === "failed") {
					toast.error("Failed to start agent", {
						description:
							result.error ??
							"Failed to start agent session in workspace setup.",
					});
				}
			});

			return true;
		},
		[resolveSetupLaunchRequest, terminalCreateOrAttach, terminalWrite],
	);

	const runSetupCommandsInPane = useCallback(
		async (paneId: string, commands: string[] | null) => {
			await writeCommandsInPane({
				paneId,
				commands,
				write: (input) => terminalWrite.mutateAsync(input),
			});
		},
		[terminalWrite],
	);

	const handleTerminalSetup = useCallback(
		(setup: PendingTerminalSetup, onComplete: () => void) => {
			const hasSetupScript =
				Array.isArray(setup.initialCommands) &&
				setup.initialCommands.length > 0;
			const presets = (setup.defaultPresets ?? []).filter(
				(p) => p.commands.length > 0,
			);
			const hasPresets = shouldApplyPreset && presets.length > 0;
			const { agentCommand, agentLaunchRequest } = setup;

			if (hasSetupScript && hasPresets) {
				const { tabId: setupTabId, paneId: setupPaneId } = addTab(
					setup.workspaceId,
				);
				setTabAutoTitle(setupTabId, "Workspace Setup");
				openPresetsInActiveTab(setup.workspaceId, presets);

				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup, setupPaneId);
				}

				createOrAttach.mutate(
					{
						paneId: setupPaneId,
						tabId: setupTabId,
						workspaceId: setup.workspaceId,
					},
					{
						onSuccess: () => {
							void runSetupCommandsInPane(
								setupPaneId,
								setup.initialCommands ?? null,
							)
								.catch((error) => {
									console.error(
										"[WorkspaceInitEffects] Failed to run setup commands:",
										error,
									);
									toast.error("Failed to run setup commands", {
										description:
											error instanceof Error
												? error.message
												: "Failed to execute setup commands.",
									});
								})
								.finally(() => onComplete());
						},
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

				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup, paneId);
				}

				createOrAttach.mutate(
					{
						paneId,
						tabId,
						workspaceId: setup.workspaceId,
					},
					{
						onSuccess: () => {
							void runSetupCommandsInPane(paneId, setup.initialCommands ?? null)
								.catch((error) => {
									console.error(
										"[WorkspaceInitEffects] Failed to run setup commands:",
										error,
									);
									toast.error("Failed to run setup commands", {
										description:
											error instanceof Error
												? error.message
												: "Failed to execute setup commands.",
									});
								})
								.finally(() => onComplete());
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
										const { tabId: newTabId, paneId: newPaneId } = addTab(
											setup.workspaceId,
										);
										createOrAttach.mutate(
											{
												paneId: newPaneId,
												tabId: newTabId,
												workspaceId: setup.workspaceId,
											},
											{
												onSuccess: () => {
													void runSetupCommandsInPane(
														newPaneId,
														setup.initialCommands ?? null,
													).catch((runError) => {
														console.error(
															"[WorkspaceInitEffects] Failed to run setup commands:",
															runError,
														);
														toast.error("Failed to run setup commands", {
															description:
																runError instanceof Error
																	? runError.message
																	: "Failed to execute setup commands.",
														});
													});
												},
											},
										);
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
				openPresetsInActiveTab(setup.workspaceId, presets);
				if (agentLaunchRequest || agentCommand) {
					launchAgentViaOrchestrator(setup);
				}
				onComplete();
				return;
			}

			if (agentLaunchRequest || agentCommand) {
				launchAgentViaOrchestrator(setup);
				onComplete();
				return;
			}

			onComplete();
		},
		[
			addTab,
			setTabAutoTitle,
			createOrAttach,
			launchAgentViaOrchestrator,
			runSetupCommandsInPane,
			openPresetsInActiveTab,
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
