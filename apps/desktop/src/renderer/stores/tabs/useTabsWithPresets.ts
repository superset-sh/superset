import {
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db/schema/zod";
import { useCallback, useMemo } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { useCreateOrAttachWithTheme } from "renderer/hooks/useCreateOrAttachWithTheme";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	buildTerminalCommand,
	launchCommandInPane,
	writeCommandsInPane,
} from "renderer/lib/terminal/launch-command";
import {
	getPresetLaunchPlan,
	type PresetMode,
	type PresetOpenTarget,
} from "./preset-launch";
import { useTabsStore } from "./store";
import type { AddTabOptions, SplitPaneOptions } from "./types";
import { resolveActiveTabIdForWorkspace } from "./utils";

interface OpenPresetOptions {
	target?: PresetOpenTarget;
	modeOverride?: PresetMode;
}

interface PreparedPreset {
	mode: PresetMode;
	commands: string[];
	initialCwd?: string;
	name?: string;
}

interface PresetPaneLaunch {
	paneId: string;
	tabId: string;
	workspaceId: string;
	command: string;
	cwd: string | undefined;
}

function preparePreset(preset: TerminalPreset): PreparedPreset {
	return {
		mode: normalizeExecutionMode(preset.executionMode),
		commands: preset.commands,
		initialCwd: preset.cwd || undefined,
		name: preset.name || undefined,
	};
}

export function useTabsWithPresets(projectId?: string | null) {
	const newTabPresetsInput = useMemo(
		() => ({ projectId: projectId ?? null }),
		[projectId],
	);
	const { data: newTabPresets = [] } =
		electronTrpc.settings.getNewTabPresets.useQuery(newTabPresetsInput);

	const storeAddTab = useTabsStore((s) => s.addTab);
	const storeAddTabWithMultiplePanes = useTabsStore(
		(s) => s.addTabWithMultiplePanes,
	);
	const storeAddPane = useTabsStore((s) => s.addPane);
	const storeAddPanesToTab = useTabsStore((s) => s.addPanesToTab);
	const storeSplitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const storeSplitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const storeSplitPaneAuto = useTabsStore((s) => s.splitPaneAuto);
	const renameTab = useTabsStore((s) => s.renameTab);
	const createOrAttach = useCreateOrAttachWithTheme();
	const writeToTerminal = electronTrpc.terminal.write.useMutation();

	const firstPreset = newTabPresets[0] ?? null;
	const firstPresetCommand = useMemo(
		() => (firstPreset ? buildTerminalCommand(firstPreset.commands) : null),
		[firstPreset],
	);

	const firstPresetOptions: AddTabOptions | undefined = useMemo(() => {
		if (!firstPreset) return undefined;
		return {
			initialCwd: firstPreset.cwd || undefined,
		};
	}, [firstPreset]);

	const applyTabName = useCallback(
		(tabId: string, name?: string) => {
			if (name) {
				renameTab(tabId, name);
			}
		},
		[renameTab],
	);

	const resolveActiveWorkspaceTabId = useCallback((workspaceId: string) => {
		const state = useTabsStore.getState();
		return resolveActiveTabIdForWorkspace({
			workspaceId,
			tabs: state.tabs,
			activeTabIds: state.activeTabIds,
			tabHistoryStacks: state.tabHistoryStacks,
		});
	}, []);

	const launchPresetCommand = useCallback(
		({ paneId, tabId, workspaceId, command, cwd }: PresetPaneLaunch) => {
			void launchCommandInPane({
				paneId,
				tabId,
				workspaceId,
				command,
				cwd,
				createOrAttach: (input) => createOrAttach.mutateAsync(input),
				write: (input) => writeToTerminal.mutateAsync(input),
			}).catch((error) => {
				console.error("[useTabsWithPresets] Failed to launch preset command:", {
					paneId,
					tabId,
					workspaceId,
					error: error instanceof Error ? error.message : String(error),
				});
			});
		},
		[createOrAttach, writeToTerminal],
	);

	const launchPresetCommands = useCallback(
		(launches: PresetPaneLaunch[]) => {
			for (const launch of launches) {
				launchPresetCommand(launch);
			}
		},
		[launchPresetCommand],
	);

	const resolveWorkspaceIdForTab = useCallback((tabId: string) => {
		const tab = useTabsStore
			.getState()
			.tabs.find((tabItem) => tabItem.id === tabId);
		return tab?.workspaceId ?? null;
	}, []);

	const launchFirstPresetInPane = useCallback(
		(tabId: string, paneId: string) => {
			if (firstPresetCommand === null) return;
			const workspaceId = resolveWorkspaceIdForTab(tabId);
			if (!workspaceId) return;
			launchPresetCommand({
				paneId,
				tabId,
				workspaceId,
				command: firstPresetCommand,
				cwd: firstPreset?.cwd || undefined,
			});
		},
		[
			firstPreset,
			firstPresetCommand,
			launchPresetCommand,
			resolveWorkspaceIdForTab,
		],
	);

	const launchFirstPresetInFocusedPane = useCallback(
		(tabId: string, previousFocusedPaneId: string | undefined) => {
			if (firstPresetCommand === null) return;
			const state = useTabsStore.getState();
			const paneId = state.focusedPaneIds[tabId];
			if (!paneId || paneId === previousFocusedPaneId) return;
			const tab = state.tabs.find((tabItem) => tabItem.id === tabId);
			if (!tab) return;
			launchPresetCommand({
				paneId,
				tabId,
				workspaceId: tab.workspaceId,
				command: firstPresetCommand,
				cwd: firstPreset?.cwd || undefined,
			});
		},
		[firstPreset, firstPresetCommand, launchPresetCommand],
	);

	const executePresetInNewTab = useCallback(
		(workspaceId: string, preset: PreparedPreset) => {
			const hasMultipleCommands = preset.commands.length > 1;

			if (preset.mode === "new-tab" && hasMultipleCommands) {
				let firstResult: { tabId: string; paneId: string } | null = null;
				const launches: PresetPaneLaunch[] = [];

				for (const command of preset.commands) {
					const result = storeAddTab(workspaceId, {
						initialCwd: preset.initialCwd,
					});
					if (!firstResult) {
						firstResult = result;
					}
					launches.push({
						paneId: result.paneId,
						tabId: result.tabId,
						workspaceId,
						command,
						cwd: preset.initialCwd,
					});
					applyTabName(result.tabId, preset.name);
				}

				if (firstResult) {
					launchPresetCommands(launches);
					return firstResult;
				}

				const fallback = storeAddTab(workspaceId, {
					initialCwd: preset.initialCwd,
				});
				applyTabName(fallback.tabId, preset.name);
				return fallback;
			}

			if (hasMultipleCommands) {
				const multiPane = storeAddTabWithMultiplePanes(workspaceId, {
					commands: preset.commands,
					initialCwd: preset.initialCwd,
				});
				const launches: PresetPaneLaunch[] = multiPane.paneIds.flatMap(
					(paneId, index) => {
						const command = preset.commands[index];
						if (command === undefined) return [];
						return [
							{
								paneId,
								tabId: multiPane.tabId,
								workspaceId,
								command,
								cwd: preset.initialCwd,
							},
						];
					},
				);
				launchPresetCommands(launches);
				applyTabName(multiPane.tabId, preset.name);
				return { tabId: multiPane.tabId, paneId: multiPane.paneIds[0] };
			}

			const command = buildTerminalCommand(preset.commands);
			const result = storeAddTab(workspaceId, {
				initialCwd: preset.initialCwd,
			});
			if (command !== null) {
				launchPresetCommand({
					paneId: result.paneId,
					tabId: result.tabId,
					workspaceId,
					command,
					cwd: preset.initialCwd,
				});
			}
			applyTabName(result.tabId, preset.name);
			return result;
		},
		[
			storeAddTab,
			storeAddTabWithMultiplePanes,
			applyTabName,
			launchPresetCommand,
			launchPresetCommands,
		],
	);

	const executePreset = useCallback(
		(workspaceId: string, preset: PreparedPreset, target: PresetOpenTarget) => {
			const activeTabId =
				target === "active-tab" && preset.mode === "split-pane"
					? resolveActiveWorkspaceTabId(workspaceId)
					: null;

			const plan = getPresetLaunchPlan({
				mode: preset.mode,
				target,
				commandCount: preset.commands.length,
				hasActiveTab: !!activeTabId,
			});

			if (plan === "active-tab-multi-pane" && activeTabId) {
				const paneIds = storeAddPanesToTab(activeTabId, {
					commands: preset.commands,
					initialCwd: preset.initialCwd,
				});
				if (paneIds.length > 0) {
					const launches: PresetPaneLaunch[] = paneIds.flatMap(
						(paneId, index) => {
							const command = preset.commands[index];
							if (command === undefined) return [];
							return [
								{
									paneId,
									tabId: activeTabId,
									workspaceId,
									command,
									cwd: preset.initialCwd,
								},
							];
						},
					);
					launchPresetCommands(launches);
					return { tabId: activeTabId, paneId: paneIds[0] };
				}
				return executePresetInNewTab(workspaceId, preset);
			}

			if (plan === "active-tab-single" && activeTabId) {
				const command = buildTerminalCommand(preset.commands);
				const paneId = storeAddPane(activeTabId, {
					initialCwd: preset.initialCwd,
				});
				if (paneId) {
					if (command !== null) {
						launchPresetCommand({
							paneId,
							tabId: activeTabId,
							workspaceId,
							command,
							cwd: preset.initialCwd,
						});
					}
					return { tabId: activeTabId, paneId };
				}
				return executePresetInNewTab(workspaceId, preset);
			}

			return executePresetInNewTab(workspaceId, preset);
		},
		[
			resolveActiveWorkspaceTabId,
			storeAddPanesToTab,
			storeAddPane,
			executePresetInNewTab,
			launchPresetCommands,
			launchPresetCommand,
		],
	);

	const openPresetInCurrentTerminal = useCallback(
		(workspaceId: string, preset: TerminalPreset) => {
			const activeTabId = resolveActiveWorkspaceTabId(workspaceId);
			if (!activeTabId) return false;

			const state = useTabsStore.getState();
			const paneId = state.focusedPaneIds[activeTabId];
			if (!paneId) return false;

			const pane = state.panes[paneId];
			if (!pane || pane.type !== "terminal") return false;

			void writeCommandsInPane({
				paneId,
				commands: preset.commands,
				write: (input) => writeToTerminal.mutateAsync(input),
			}).catch((error) => {
				console.error(
					"[useTabsWithPresets] Failed to send preset commands to current terminal:",
					{
						workspaceId,
						tabId: activeTabId,
						paneId,
						error: error instanceof Error ? error.message : String(error),
					},
				);
			});

			return true;
		},
		[resolveActiveWorkspaceTabId, writeToTerminal],
	);

	const openPreset = useCallback(
		(
			workspaceId: string,
			preset: TerminalPreset,
			options?: OpenPresetOptions,
		) => {
			const prepared = preparePreset(preset);
			const target = options?.target ?? "new-tab";
			const mode = options?.modeOverride ?? prepared.mode;
			return executePreset(workspaceId, { ...prepared, mode }, target);
		},
		[executePreset],
	);

	const addTab = useCallback(
		(workspaceId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddTab(workspaceId, options);
			}

			if (newTabPresets.length === 0) {
				return storeAddTab(workspaceId);
			}

			const firstResult = openPreset(workspaceId, newTabPresets[0], {
				target: "new-tab",
			});
			for (let i = 1; i < newTabPresets.length; i++) {
				openPreset(workspaceId, newTabPresets[i], { target: "new-tab" });
			}

			return { tabId: firstResult.tabId, paneId: firstResult.paneId };
		},
		[storeAddTab, newTabPresets, openPreset],
	);

	const addPane = useCallback(
		(tabId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddPane(tabId, options);
			}
			const paneId = storeAddPane(tabId, firstPresetOptions);
			if (paneId) {
				launchFirstPresetInPane(tabId, paneId);
			}
			return paneId;
		},
		[storeAddPane, firstPresetOptions, launchFirstPresetInPane],
	);

	const splitPaneVertical = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: SplitPaneOptions,
		) => {
			if (options) {
				return storeSplitPaneVertical(tabId, sourcePaneId, path, options);
			}
			const previousFocusedPaneId =
				useTabsStore.getState().focusedPaneIds[tabId];
			storeSplitPaneVertical(tabId, sourcePaneId, path, firstPresetOptions);
			launchFirstPresetInFocusedPane(tabId, previousFocusedPaneId);
		},
		[
			storeSplitPaneVertical,
			firstPresetOptions,
			launchFirstPresetInFocusedPane,
		],
	);

	const splitPaneHorizontal = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: SplitPaneOptions,
		) => {
			if (options) {
				return storeSplitPaneHorizontal(tabId, sourcePaneId, path, options);
			}
			const previousFocusedPaneId =
				useTabsStore.getState().focusedPaneIds[tabId];
			storeSplitPaneHorizontal(tabId, sourcePaneId, path, firstPresetOptions);
			launchFirstPresetInFocusedPane(tabId, previousFocusedPaneId);
		},
		[
			storeSplitPaneHorizontal,
			firstPresetOptions,
			launchFirstPresetInFocusedPane,
		],
	);

	const splitPaneAuto = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			dimensions: { width: number; height: number },
			path?: MosaicBranch[],
			options?: SplitPaneOptions,
		) => {
			if (options) {
				return storeSplitPaneAuto(
					tabId,
					sourcePaneId,
					dimensions,
					path,
					options,
				);
			}
			const previousFocusedPaneId =
				useTabsStore.getState().focusedPaneIds[tabId];
			storeSplitPaneAuto(
				tabId,
				sourcePaneId,
				dimensions,
				path,
				firstPresetOptions,
			);
			launchFirstPresetInFocusedPane(tabId, previousFocusedPaneId);
		},
		[storeSplitPaneAuto, firstPresetOptions, launchFirstPresetInFocusedPane],
	);

	return {
		addTab,
		addPane,
		splitPaneVertical,
		splitPaneHorizontal,
		splitPaneAuto,
		openPreset,
		openPresetInCurrentTerminal,
	};
}
