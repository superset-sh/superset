import fs from "node:fs";
import path from "node:path";
import { syncManagedMcpServers } from "@superset/agent-setup";
import { getBundledPluginDir } from "@superset/agent-setup/config";
import { settings } from "@superset/local-db";
import {
	getPluginByName,
	type InstalledPlugin,
	type PluginMcpServerConfig,
	SUPERSET_MANAGED_SKILLS,
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
		// Disabled installs and unknown names (a catalog entry removed after
		// install) contribute nothing, so their servers reap on the next sync.
		// Per-agent skipping of servers the user configured themselves happens
		// inside syncManagedMcpServers, scoped to each agent's own config.
		if (install.enabled === false) continue;
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

/**
 * SKILL.md body (frontmatter stripped) of a bundled managed skill, for the
 * preview modal. Allowlisted against the shipped skill set — the name never
 * touches the filesystem unless it's one of ours.
 */
export function getBundledSkillContent(name: string): string | null {
	if (!SUPERSET_MANAGED_SKILLS.some((skill) => skill.name === name)) {
		return null;
	}
	const skillPath = path.join(
		getBundledPluginDir(),
		"skills",
		name,
		"SKILL.md",
	);
	try {
		const raw = fs.readFileSync(skillPath, "utf-8");
		return raw.replace(/^---\n[\s\S]*?\n---\n*/, "");
	} catch {
		return null;
	}
}

const SKILL_ICON_FILES = [
	{ file: "icon.svg", mime: "image/svg+xml" },
	{ file: "icon.png", mime: "image/png" },
] as const;

/**
 * Data URIs of per-skill icons distributed inside the skill folders
 * (`skills/<name>/icon.svg|png`) — the Superset convention for skill authors
 * to ship artwork with their skill, mirroring how Codex plugins carry
 * `interface` icons. Skills without one fall back to a default glyph in the
 * renderer.
 */
export function getBundledSkillIcons(): Record<string, string> {
	const icons: Record<string, string> = {};
	for (const skill of SUPERSET_MANAGED_SKILLS) {
		for (const { file, mime } of SKILL_ICON_FILES) {
			const iconPath = path.join(
				getBundledPluginDir(),
				"skills",
				skill.name,
				file,
			);
			try {
				const data = fs.readFileSync(iconPath);
				icons[skill.name] = `data:${mime};base64,${data.toString("base64")}`;
				break;
			} catch {
				// No icon in this format; try the next or fall through.
			}
		}
	}
	return icons;
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
	syncInstalledPluginMcpServers();
	return next;
}
