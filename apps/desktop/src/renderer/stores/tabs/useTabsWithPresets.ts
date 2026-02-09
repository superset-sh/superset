import type { TerminalPreset } from "@superset/local-db";
import { useCallback, useMemo } from "react";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "./store";
import type { AddTabOptions } from "./types";

/**
 * Hook that wraps tab store actions with default preset support.
 * When a preset with applyOnNewTab is configured, new terminals will
 * automatically use that preset's commands and cwd.
 */
export function useTabsWithPresets() {
	const { data: newTabPreset } =
		electronTrpc.settings.getNewTabPreset.useQuery();

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
		if (!newTabPreset) return undefined;
		return {
			initialCommands: newTabPreset.commands,
			initialCwd: newTabPreset.cwd || undefined,
		};
	}, [newTabPreset]);

	const shouldUseParallelMode = useMemo(() => {
		return (
			newTabPreset?.executionMode === "parallel" &&
			(newTabPreset?.commands.length ?? 0) > 1
		);
	}, [newTabPreset]);

	const addTab = useCallback(
		(workspaceId: string, options?: AddTabOptions) => {
			if (options) {
				return storeAddTab(workspaceId, options);
			}

			if (shouldUseParallelMode && newTabPreset) {
				const { tabId, paneIds } = storeAddTabWithMultiplePanes(workspaceId, {
					commands: newTabPreset.commands,
					initialCwd: newTabPreset.cwd || undefined,
				});

				if (newTabPreset.name) {
					renameTab(tabId, newTabPreset.name);
				}

				return { tabId, paneId: paneIds[0] };
			}

			const result = storeAddTab(workspaceId, defaultPresetOptions);

			if (newTabPreset?.name) {
				renameTab(result.tabId, newTabPreset.name);
			}

			return result;
		},
		[
			storeAddTab,
			storeAddTabWithMultiplePanes,
			defaultPresetOptions,
			newTabPreset,
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
		defaultPreset: newTabPreset,
	};
}
