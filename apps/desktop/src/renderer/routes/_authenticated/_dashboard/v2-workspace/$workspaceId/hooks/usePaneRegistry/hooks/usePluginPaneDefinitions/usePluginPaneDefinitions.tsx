import type { PaneRegistry } from "@superset/panes";
import { useMemo } from "react";
import { LuPuzzle } from "react-icons/lu";
import { PluginPaneFallback } from "renderer/plugins/PluginPaneFallback";
import { PluginSlotMount } from "renderer/plugins/PluginSlotMount";
import {
	isRunningWithUi,
	pluginBundleVersion,
	useInstalledPlugins,
} from "renderer/plugins/useInstalledPlugins";
import type { PaneViewerData, PluginPaneData } from "../../../../types";

/**
 * Pane definitions contributed by installed plugins, keyed by the manifest's
 * pane `kind`. Spread BEFORE the builtin definitions so a plugin kind can
 * never shadow a builtin pane.
 */
export function usePluginPaneDefinitions(
	workspaceId: string,
): PaneRegistry<PaneViewerData> {
	const plugins = useInstalledPlugins();
	return useMemo(() => {
		const definitions: PaneRegistry<PaneViewerData> = {
			// Fallback for kinds with no registered definition — plugin panes
			// whose plugin is disabled/broken/uninstalled offer the recovery
			// action here instead of the library's dead "unknown kind" text.
			"*": {
				getTitle: (pane) =>
					(pane.data as Partial<PluginPaneData> | undefined)?.pluginId
						? "Plugin pane"
						: undefined,
				getIcon: () => <LuPuzzle className="size-4 opacity-60" />,
				renderPane: (ctx) => (
					<PluginPaneFallback
						kind={ctx.pane.kind}
						pluginId={
							(ctx.pane.data as Partial<PluginPaneData> | undefined)?.pluginId
						}
						onClose={ctx.actions.close}
					/>
				),
			},
		};
		for (const plugin of plugins.filter(isRunningWithUi)) {
			for (const pane of plugin.manifest.contributes?.panes ?? []) {
				definitions[pane.kind] = {
					getTitle: () => pane.title,
					getIcon: () => <LuPuzzle className="size-4" />,
					renderPane: () => (
						<PluginSlotMount
							pluginId={plugin.id}
							bundleVersion={pluginBundleVersion(plugin)}
							componentName={pane.component}
							workspaceId={workspaceId}
						/>
					),
				};
			}
		}
		return definitions;
	}, [plugins, workspaceId]);
}
