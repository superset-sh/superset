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

	const openPresetAsNewTab = useCallback(
		(workspaceId: string, preset: TerminalPreset) => {
			const mode = resolvePresetMode(preset.executionMode);
			const commands = preset.commands;
			const hasMultipleCommands = commands.length > 1;

			if (mode === "new-tab" && hasMultipleCommands) {
				let firstResult: {
					tabId: string;
					paneId: string;
				} | null = null;

				for (const command of commands) {
					const result = storeAddTab(workspaceId, {
						initialCommands: [command],
						initialCwd: preset.cwd || undefined,
					});

					if (!firstResult) {
						firstResult = result;
					}

					if (preset.name) {
						renameTab(result.tabId, preset.name);
					}
				}

				if (!firstResult) {
					const fallback = storeAddTab(workspaceId, {
						initialCwd: preset.cwd || undefined,
					});
					if (preset.name) {
						renameTab(fallback.tabId, preset.name);
					}
					return fallback;
				}

				return firstResult;
			}

			let result: { tabId: string; paneId: string };
			if (hasMultipleCommands) {
				const multiPane = storeAddTabWithMultiplePanes(workspaceId, {
					commands,
					initialCwd: preset.cwd || undefined,
				});
				result = { tabId: multiPane.tabId, paneId: multiPane.paneIds[0] };
			} else {
				result = storeAddTab(workspaceId, {
					initialCommands: commands,
					initialCwd: preset.cwd || undefined,
				});
			}

			if (preset.name) {
				renameTab(result.tabId, preset.name);
			}

			return result;
		},
		[storeAddTab, storeAddTabWithMultiplePanes, renameTab],
	);

	const openPresetInActiveTab = useCallback(
		(workspaceId: string, preset: TerminalPreset) => {
			if (resolvePresetMode(preset.executionMode) === "new-tab") {
				return openPresetAsNewTab(workspaceId, preset);
			}

			const state = useTabsStore.getState();
			const activeTabId = resolveActiveTabIdForWorkspace({
				workspaceId,
				tabs: state.tabs,
				activeTabIds: state.activeTabIds,
				tabHistoryStacks: state.tabHistoryStacks,
			});

			if (!activeTabId) {
				return openPresetAsNewTab(workspaceId, preset);
			}

			if (preset.commands.length > 1) {
				const paneIds = storeAddPanesToTab(activeTabId, {
					commands: preset.commands,
					initialCwd: preset.cwd || undefined,
				});
				if (paneIds.length > 0) {
					return { tabId: activeTabId, paneId: paneIds[0] };
				}
				return openPresetAsNewTab(workspaceId, preset);
			}

			const paneId = storeAddPane(activeTabId, {
				initialCommands: preset.commands,
				initialCwd: preset.cwd || undefined,
			});
			if (paneId) {
				return { tabId: activeTabId, paneId };
			}

			return openPresetAsNewTab(workspaceId, preset);
		},
		[openPresetAsNewTab, storeAddPanesToTab, storeAddPane],
	);

	const openPreset = useCallback(
		(
			workspaceId: string,
			preset: TerminalPreset,
			options?: OpenPresetOptions,
		) => {
			if (options?.target === "active-tab") {
				return openPresetInActiveTab(workspaceId, preset);
			}
			return openPresetAsNewTab(workspaceId, preset);
		},
		[openPresetAsNewTab, openPresetInActiveTab],
	);

	const addTab = useCallback(
		(workspaceId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddTab(workspaceId, options);
			}

			if (newTabPresets.length === 0) {
				return storeAddTab(workspaceId);
			}

			const firstResult = openPresetAsNewTab(workspaceId, newTabPresets[0]);
			for (let i = 1; i < newTabPresets.length; i++) {
				openPresetAsNewTab(workspaceId, newTabPresets[i]);
			}

			return { tabId: firstResult.tabId, paneId: firstResult.paneId };
		},
		[storeAddTab, newTabPresets, openPresetAsNewTab],
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
