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
	const storeAddPane = useTabsStore((s) => s.addPane);
	const storeSplitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const storeSplitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const storeSplitPaneAuto = useTabsStore((s) => s.splitPaneAuto);
	const renameTab = useTabsStore((s) => s.renameTab);

	// Get preset options if a default preset is set
	const defaultPresetOptions: AddTabOptions | undefined = useMemo(() => {
		if (!defaultPreset) return undefined;
		return {
			initialCommands: defaultPreset.commands,
			initialCwd: defaultPreset.cwd || undefined,
		};
	}, [defaultPreset]);

	// Wrapped addTab that applies default preset
	const addTab = useCallback(
		(workspaceId: string, options?: AddTabOptions) => {
			// If explicit options are provided, use them; otherwise use default preset
			const effectiveOptions = options ?? defaultPresetOptions;
			const result = storeAddTab(workspaceId, effectiveOptions);

			// If using default preset and it has a name, rename the tab
			if (!options && defaultPreset?.name) {
				renameTab(result.tabId, defaultPreset.name);
			}

			return result;
		},
		[storeAddTab, defaultPresetOptions, defaultPreset, renameTab],
	);

	// Wrapped addPane that applies default preset
	const addPane = useCallback(
		(tabId: string, options?: AddTabOptions) => {
			const effectiveOptions = options ?? defaultPresetOptions;
			return storeAddPane(tabId, effectiveOptions);
		},
		[storeAddPane, defaultPresetOptions],
	);

	// Wrapped splitPaneVertical that applies default preset
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

	// Wrapped splitPaneHorizontal that applies default preset
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

	// Wrapped splitPaneAuto that applies default preset
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

	return {
		addTab,
		addPane,
		splitPaneVertical,
		splitPaneHorizontal,
		splitPaneAuto,
		defaultPreset,
	};
}
