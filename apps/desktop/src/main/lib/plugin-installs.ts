import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	mcpHeadersHelperCommand,
	readPluginConnections,
	syncManagedMcpServers,
	writePluginConnections,
} from "@superset/agent-setup";
import { settings } from "@superset/local-db";
import {
	desiredPluginMcpServers,
	getPluginByName,
	type InstalledPlugin,
	type PluginConnectionRef,
} from "@superset/shared/plugins";
import log from "electron-log/main";
import { env } from "main/env.main";
import { resolveBundledCliPath } from "main/lib/bundled-cli";
import { localDb } from "main/lib/local-db";
import { createSerialQueue } from "main/lib/serial-queue";

/**
 * Installed-plugin state and its materialization into agent configs. State
 * lives on the local-db settings singleton (not renderer localStorage)
 * because the boot-time sync below runs in main before any renderer exists.
 * Sync is declarative: every call converges agent configs on the full
 * installed set, so installs and uninstalls both land on app restart even if
 * a mid-session sync was missed.
 */

const execFileAsync = promisify(execFile);

const pluginCliQueue = createSerialQueue();

function queuePluginCli(args: string[]): Promise<void> {
	return pluginCliQueue(() => runPluginCli(args));
}

async function runPluginCli(args: string[]): Promise<void> {
	const cli = resolveBundledCliPath();
	if (!cli) {
		log.warn("[plugins] no bundled CLI; skills were not provisioned");
		return;
	}

	try {
		await execFileAsync(cli, ["plugins", ...args, "--json"], {
			timeout: 60_000,
			env: { ...process.env, SUPERSET_CLI_AUDIENCE: "internal" },
		});
	} catch (error) {
		log.warn(
			`[plugins] ${args.join(" ")} failed; skills may be stale:`,
			error instanceof Error ? error.message : error,
		);
	}
}

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

/** Absent `connections` (boot, an install) falls back to the last synced set. */
export function syncInstalledPluginMcpServers(
	connections?: readonly PluginConnectionRef[],
): void {
	if (connections) writePluginConnections(connections);
	if (env.NODE_ENV === "development") return;
	syncManagedMcpServers(
		desiredPluginMcpServers(getInstalledPlugins(), {
			connections: connections ?? readPluginConnections(),
			headersHelper: mcpHeadersHelperCommand(),
		}),
	);
}

/** Returns the updated install list; unknown plugin names return null. */
export function installPlugin(name: string): InstalledPlugin[] | null {
	const plugin = getPluginByName(name);
	if (!plugin) return null;

	const installed = getInstalledPlugins();
	const existing = installed.find((entry) => entry.name === name);
	const record: InstalledPlugin = {
		name: plugin.name,
		version: plugin.version,
		installedAt: existing?.installedAt ?? new Date().toISOString(),
		...(existing?.enabled === false ? { enabled: false } : {}),
	};
	const next = existing
		? installed.map((entry) => (entry.name === name ? record : entry))
		: [...installed, record];

	saveInstalledPlugins(next);
	void queuePluginCli(["install", name, "--update"]);
	return next;
}

export function uninstallPlugin(name: string): InstalledPlugin[] {
	const next = getInstalledPlugins().filter((entry) => entry.name !== name);
	saveInstalledPlugins(next);
	void queuePluginCli(["uninstall", name]);
	return next;
}

/**
 * Toggling re-syncs immediately: disable reaps, enable rewrites. A plugin
 * present only via the user's own config has no record yet — toggling adopts
 * it (creates the record) so the choice has somewhere to live.
 */
export function setPluginEnabled(
	name: string,
	enabled: boolean,
): InstalledPlugin[] {
	const installed = getInstalledPlugins();
	const hasRecord = installed.some((entry) => entry.name === name);
	const plugin = getPluginByName(name);
	const next = hasRecord
		? installed.map((entry) =>
				entry.name === name ? { ...entry, enabled } : entry,
			)
		: plugin
			? [
					...installed,
					{
						name: plugin.name,
						version: plugin.version,
						installedAt: new Date().toISOString(),
						enabled,
					},
				]
			: installed;
	saveInstalledPlugins(next);
	// installed_plugins.json is the only `enabled` flag provisioning reads, and
	// local-db is not it: without this the skills stay materialized while the
	// MCP servers are reaped, leaving the plugin half on.
	void queuePluginCli([enabled ? "enable" : "disable", name]);
	return next;
}
