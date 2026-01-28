import type { TerminalPreset } from "@superset/local-db";
import { useCallback, useMemo } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { usePresets } from "renderer/react-query/presets";
import { useTabsStore } from "./store";
import type { AddTabOptions } from "./types";

/**
 * Hook that wraps tab store actions with default preset support.
 * When a default preset is configured, new terminals will automatically
 * use that preset's commands and cwd.
 */
export function useTabsWithPresets() {
	const { defaultPreset } = usePresets();

	const storeAddTab = useTabsStore((s) => s.addTab);
	const storeAddTabWithMultiplePanes = useTabsStore(
		(s) => s.addTabWithMultiplePanes,
	);
	const storeAddPane = useTabsStore((s) => s.addPane);
	const storeSplitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const storeSplitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const storeSplitPaneAuto = useTabsStore((s) => s.splitPaneAuto);
	const renameTab = useTabsStore((s) => s.renameTab);

	const defaultPresetOptions: AddTabOptions | undefined = useMemo(() => {
		if (!defaultPreset) return undefined;
		return {
			initialCommands: defaultPreset.commands,
			initialCwd: defaultPreset.cwd || undefined,
		};
	}, [defaultPreset]);

	const shouldUseParallelMode = useMemo(() => {
		return (
			defaultPreset?.executionMode === "parallel" &&
			defaultPreset.commands.length > 1
		);
	}, [defaultPreset]);

	const addTab = useCallback(
		(workspaceId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddTab(workspaceId, options);
			}

			if (shouldUseParallelMode && defaultPreset) {
				const { tabId, paneIds } = storeAddTabWithMultiplePanes(workspaceId, {
					commands: defaultPreset.commands,
					initialCwd: defaultPreset.cwd || undefined,
				});

				if (defaultPreset.name) {
					renameTab(tabId, defaultPreset.name);
				}

				return { tabId, paneId: paneIds[0] };
			}

			const result = storeAddTab(workspaceId, defaultPresetOptions);

			if (defaultPreset?.name) {
				renameTab(result.tabId, defaultPreset.name);
			}

			return result;
		},
		[
			storeAddTab,
			storeAddTabWithMultiplePanes,
			defaultPresetOptions,
			defaultPreset,
			shouldUseParallelMode,
			renameTab,
		],
	);

	const addPane = useCallback(
		(tabId: string, options?: AddTabOptions) => {
			const effectiveOptions = options ?? defaultPresetOptions;
			return storeAddPane(tabId, effectiveOptions);
		},
		[storeAddPane, defaultPresetOptions],
	);

	const splitPaneVertical = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: AddTabOptions,
		) => {
			const effectiveOptions = options ?? defaultPresetOptions;
			return storeSplitPaneVertical(
				tabId,
				sourcePaneId,
				path,
				effectiveOptions,
			);
		},
		[storeSplitPaneVertical, defaultPresetOptions],
	);

	const splitPaneHorizontal = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			path?: MosaicBranch[],
			options?: AddTabOptions,
		) => {
			const effectiveOptions = options ?? defaultPresetOptions;
			return storeSplitPaneHorizontal(
				tabId,
				sourcePaneId,
				path,
				effectiveOptions,
			);
		},
		[storeSplitPaneHorizontal, defaultPresetOptions],
	);

	const splitPaneAuto = useCallback(
		(
			tabId: string,
			sourcePaneId: string,
			dimensions: { width: number; height: number },
			path?: MosaicBranch[],
			options?: AddTabOptions,
		) => {
			const effectiveOptions = options ?? defaultPresetOptions;
			return storeSplitPaneAuto(
				tabId,
				sourcePaneId,
				dimensions,
				path,
				effectiveOptions,
			);
		},
		[storeSplitPaneAuto, defaultPresetOptions],
	);

	const openPreset = useCallback(
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

	return {
		addTab,
		addPane,
		splitPaneVertical,
		splitPaneHorizontal,
		splitPaneAuto,
		openPreset,
		defaultPreset,
	};
}
