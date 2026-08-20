import { syncManagedMcpServers } from "@superset/agent-setup";
import { settings } from "@superset/local-db";
import {
	getPluginByName,
	type InstalledPlugin,
	type PluginMcpServerConfig,
} from "@superset/shared/plugins";
import { localDb } from "main/lib/local-db";

/**
 * Installed-plugin state and its materialization into agent configs. State
 * lives on the local-db settings singleton (not renderer localStorage)
 * because the boot-time sync below runs in main before any renderer exists.
 * Sync is declarative: every call converges agent configs on the full
 * installed set, so installs and uninstalls both land on app restart even if
 * a mid-session sync was missed.
 */

export function getInstalledPlugins(): InstalledPlugin[] {
	return localDb.select().from(settings).get()?.installedPlugins ?? [];
}

function saveInstalledPlugins(next: InstalledPlugin[]): void {
	localDb
		.insert(settings)
		.values({ id: 1, installedPlugins: next })
		.onConflictDoUpdate({
			target: settings.id,
			set: { installedPlugins: next },
		})
		.run();
}

function desiredMcpServers(
	installed: InstalledPlugin[],
): Record<string, PluginMcpServerConfig> {
	const desired: Record<string, PluginMcpServerConfig> = {};
	for (const install of installed) {
		// Unknown names (a catalog entry removed after install) contribute
		// nothing, so their servers reap on the next sync.
		const plugin = getPluginByName(install.name);
		if (!plugin) continue;
		Object.assign(desired, plugin.mcpServers);
	}
	return desired;
}

export function syncInstalledPluginMcpServers(): void {
	syncManagedMcpServers(desiredMcpServers(getInstalledPlugins()));
}

/** Returns the updated install list; unknown plugin names return null. */
export function installPlugin(name: string): InstalledPlugin[] | null {
	const plugin = getPluginByName(name);
	if (!plugin) return null;

	const installed = getInstalledPlugins();
	const next = installed.some((entry) => entry.name === name)
		? installed
		: [
				...installed,
				{
					name: plugin.name,
					version: plugin.version,
					installedAt: new Date().toISOString(),
				},
			];
	saveInstalledPlugins(next);
	syncInstalledPluginMcpServers();
	return next;
}

export function uninstallPlugin(name: string): InstalledPlugin[] {
	const next = getInstalledPlugins().filter((entry) => entry.name !== name);
	saveInstalledPlugins(next);
	syncInstalledPluginMcpServers();
	return next;
}
