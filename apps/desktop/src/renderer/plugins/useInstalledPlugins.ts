import type { PluginSnapshot } from "@superset/host-service";
import { usePluginEvents, workspaceTrpc } from "@superset/workspace-client";

export type InstalledPlugin = PluginSnapshot;

/**
 * Installed plugins on the active host. The host broadcasts a lifecycle
 * `plugin:event` on install/enable/disable/reload (CLI installs included),
 * which invalidates the list immediately; focus refetch is the fallback.
 */
export function useInstalledPlugins(): InstalledPlugin[] {
	const utils = workspaceTrpc.useUtils();
	const { data } = workspaceTrpc.plugins.list.useQuery(undefined, {
		staleTime: 15_000,
		refetchOnWindowFocus: true,
	});
	usePluginEvents("*", (_id, event) => {
		const payload = event.payload as { type?: string } | null;
		if (payload?.type === "lifecycle") {
			void utils.plugins.list.invalidate();
		}
	});
	return data ?? [];
}

export function isRunningWithUi(plugin: InstalledPlugin): boolean {
	return plugin.status === "running" && Boolean(plugin.manifest.app);
}

export function pluginBundleVersion(plugin: InstalledPlugin): string {
	return `${plugin.version}:${plugin.updatedAt}`;
}
