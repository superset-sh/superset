import type { TerminalPreset } from "@superset/local-db";
import { useCallback, useMemo } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "./store";
import type { AddTabOptions } from "./types";
import { resolveActiveTabIdForWorkspace } from "./utils";

function resolvePresetMode(mode?: string) {
	if (mode === "new-tab") {
		return "new-tab";
	}
	return "split-pane";
}

interface OpenPresetOptions {
	target?: "new-tab" | "active-tab";
}

interface PreparedPreset {
	mode: "split-pane" | "new-tab";
	commands: string[];
	initialCwd?: string;
	name?: string;
}

export function useTabsWithPresets() {
	const { data: newTabPresets = [] } =
		electronTrpc.settings.getNewTabPresets.useQuery();

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

	const firstPreset = newTabPresets[0] ?? null;

	const firstPresetOptions: AddTabOptions | undefined = useMemo(() => {
		if (!firstPreset) return undefined;
		return {
			initialCommands: firstPreset.commands,
			initialCwd: firstPreset.cwd || undefined,
		};
	}, [firstPreset]);

	const preparePreset = useCallback(
		(preset: TerminalPreset): PreparedPreset => {
			return {
				mode: resolvePresetMode(preset.executionMode),
				commands: preset.commands,
				initialCwd: preset.cwd || undefined,
				name: preset.name || undefined,
			};
		},
		[],
	);

	const applyTabName = useCallback(
		(tabId: string, name?: string) => {
			if (name) {
				renameTab(tabId, name);
			}
		},
		[renameTab],
	);

	const executePresetInNewTab = useCallback(
		(workspaceId: string, preset: PreparedPreset) => {
			const hasMultipleCommands = preset.commands.length > 1;

			if (preset.mode === "new-tab" && hasMultipleCommands) {
				let firstResult: { tabId: string; paneId: string } | null = null;

				for (const command of preset.commands) {
					const result = storeAddTab(workspaceId, {
						initialCommands: [command],
						initialCwd: preset.initialCwd,
					});
					if (!firstResult) {
						firstResult = result;
					}
					applyTabName(result.tabId, preset.name);
				}

				return (
					firstResult ??
					(() => {
						const fallback = storeAddTab(workspaceId, {
							initialCwd: preset.initialCwd,
						});
						applyTabName(fallback.tabId, preset.name);
						return fallback;
					})()
				);
			}

			if (hasMultipleCommands) {
				const multiPane = storeAddTabWithMultiplePanes(workspaceId, {
					commands: preset.commands,
					initialCwd: preset.initialCwd,
				});
				applyTabName(multiPane.tabId, preset.name);
				return { tabId: multiPane.tabId, paneId: multiPane.paneIds[0] };
			}

			const result = storeAddTab(workspaceId, {
				initialCommands: preset.commands,
				initialCwd: preset.initialCwd,
			});
			applyTabName(result.tabId, preset.name);
			return result;
		},
		[storeAddTab, storeAddTabWithMultiplePanes, applyTabName],
	);

	const executePresetInActiveTab = useCallback(
		(workspaceId: string, preset: PreparedPreset) => {
			if (preset.mode === "new-tab") {
				return executePresetInNewTab(workspaceId, preset);
			}

			const state = useTabsStore.getState();
			const activeTabId = resolveActiveTabIdForWorkspace({
				workspaceId,
				tabs: state.tabs,
				activeTabIds: state.activeTabIds,
				tabHistoryStacks: state.tabHistoryStacks,
			});

			if (!activeTabId) {
				return executePresetInNewTab(workspaceId, preset);
			}

			if (preset.commands.length > 1) {
				const paneIds = storeAddPanesToTab(activeTabId, {
					commands: preset.commands,
					initialCwd: preset.initialCwd,
				});
				if (paneIds.length > 0) {
					return { tabId: activeTabId, paneId: paneIds[0] };
				}
				return executePresetInNewTab(workspaceId, preset);
			}

			const paneId = storeAddPane(activeTabId, {
				initialCommands: preset.commands,
				initialCwd: preset.initialCwd,
			});
			if (paneId) {
				return { tabId: activeTabId, paneId };
			}

			return executePresetInNewTab(workspaceId, preset);
		},
		[executePresetInNewTab, storeAddPanesToTab, storeAddPane],
	);

	const openPreset = useCallback(
		(
			workspaceId: string,
			preset: TerminalPreset,
			options?: OpenPresetOptions,
		) => {
			const prepared = preparePreset(preset);
			if (options?.target === "active-tab") {
				return executePresetInActiveTab(workspaceId, prepared);
			}
			return executePresetInNewTab(workspaceId, prepared);
		},
		[preparePreset, executePresetInActiveTab, executePresetInNewTab],
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
			const effectiveOptions = options ?? firstPresetOptions;
			return storeAddPane(tabId, effectiveOptions);
		},
		[storeAddPane, firstPresetOptions],
	);

	const splitPaneVertical = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: AddTabOptions,
		) => {
			const effectiveOptions = options ?? firstPresetOptions;
			return storeSplitPaneVertical(
				tabId,
				sourcePaneId,
				path,
				effectiveOptions,
			);
		},
		[storeSplitPaneVertical, firstPresetOptions],
	);

	const splitPaneHorizontal = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: AddTabOptions,
		) => {
			const effectiveOptions = options ?? firstPresetOptions;
			return storeSplitPaneHorizontal(
				tabId,
				sourcePaneId,
				path,
				effectiveOptions,
			);
		},
		[storeSplitPaneHorizontal, firstPresetOptions],
	);

	const splitPaneAuto = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			dimensions: { width: number; height: number },
			path?: MosaicBranch[],
			options?: AddTabOptions,
		) => {
			const effectiveOptions = options ?? firstPresetOptions;
			return storeSplitPaneAuto(
				tabId,
				sourcePaneId,
				dimensions,
				path,
				effectiveOptions,
			);
		},
		[storeSplitPaneAuto, firstPresetOptions],
	);

	return {
		addTab,
		addPane,
		splitPaneVertical,
		splitPaneHorizontal,
		splitPaneAuto,
		openPreset,
	};
}
