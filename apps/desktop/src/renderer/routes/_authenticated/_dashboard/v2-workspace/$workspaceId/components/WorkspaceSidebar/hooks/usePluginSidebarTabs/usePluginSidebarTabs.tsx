import { useMemo } from "react";
import { LuPuzzle } from "react-icons/lu";
import { PluginSlotMount } from "renderer/plugins/PluginSlotMount";
import {
	isRunningWithUi,
	pluginBundleVersion,
	useInstalledPlugins,
} from "renderer/plugins/useInstalledPlugins";
import type { SidebarTabDefinition } from "../../types";

/** Sidebar tabs contributed by installed plugins, ids `plugin:<pluginId>:<tabId>`. */
export function usePluginSidebarTabs(
	workspaceId: string,
): SidebarTabDefinition[] {
	const plugins = useInstalledPlugins();
	return useMemo(
		() =>
			plugins.filter(isRunningWithUi).flatMap((plugin) =>
				(plugin.manifest.contributes?.sidebarTabs ?? []).map(
					(tab): SidebarTabDefinition => ({
						id: `plugin:${plugin.id}:${tab.id}`,
						label: tab.label,
						icon: LuPuzzle,
						content: (
							<PluginSlotMount
								pluginId={plugin.id}
								bundleVersion={pluginBundleVersion(plugin)}
								componentName={tab.component}
								workspaceId={workspaceId}
							/>
						),
					}),
				),
			),
		[plugins, workspaceId],
	);
}
