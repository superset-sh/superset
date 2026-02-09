import type { TerminalPreset } from "@superset/local-db";
import { useCallback, useMemo } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "./store";
import type { AddTabOptions } from "./types";

/**
 * Hook that wraps tab store actions with default preset support.
 * When presets are tagged with applyOnNewTab, new terminals will
 * automatically use those presets' commands and cwd.
 */
export function useTabsWithPresets() {
	const { data: newTabPresets = [] } =
		electronTrpc.settings.getNewTabPresets.useQuery();

	const storeAddTab = useTabsStore((s) => s.addTab);
	const storeAddTabWithMultiplePanes = useTabsStore(
		(s) => s.addTabWithMultiplePanes,
	);
	const storeAddPane = useTabsStore((s) => s.addPane);
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

	const openPresetAsTab = useCallback(
		(workspaceId: string, preset: TerminalPreset) => {
			const isParallel =
				preset.executionMode === "parallel" && preset.commands.length > 1;

			const { tabId } = isParallel
				? storeAddTabWithMultiplePanes(workspaceId, {
						commands: preset.commands,
						initialCwd: preset.cwd || undefined,
					})
				: storeAddTab(workspaceId, {
						initialCommands: preset.commands,
						initialCwd: preset.cwd || undefined,
					});

			if (preset.name) {
				renameTab(tabId, preset.name);
			}

			return { tabId };
		},
		[storeAddTab, storeAddTabWithMultiplePanes, renameTab],
	);

	const addTab = useCallback(
		(workspaceId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddTab(workspaceId, options);
			}

			if (newTabPresets.length === 0) {
				return storeAddTab(workspaceId);
			}

			// Open the first preset using the normal addTab path
			const firstResult = openPresetAsTab(workspaceId, newTabPresets[0]);

			// Open additional presets as separate tabs
			for (let i = 1; i < newTabPresets.length; i++) {
				openPresetAsTab(workspaceId, newTabPresets[i]);
			}

			return { tabId: firstResult.tabId, paneId: firstResult.tabId };
		},
		[storeAddTab, newTabPresets, openPresetAsTab],
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

	const openPreset = useCallback(
		(workspaceId: string, preset: TerminalPreset) => {
			return openPresetAsTab(workspaceId, preset);
		},
		[openPresetAsTab],
	);

	return {
		addTab,
		addPane,
		splitPaneVertical,
		splitPaneHorizontal,
		splitPaneAuto,
		openPreset,
		defaultPreset: firstPreset,
	};
}
