import fs from "node:fs";
import path from "node:path";
import type { PluginSkillSource } from "./managed-skills";
import { resolveSupersetHomeDir } from "./paths";

export function installedPluginsFilePath(): string {
	return path.join(
		resolveSupersetHomeDir(),
		"plugins",
		"installed_plugins.json",
	);
}

interface InstalledPluginRecord {
	name?: unknown;
	marketplace?: unknown;
	installPath?: unknown;
	enabled?: unknown;
}

/**
 * `file` defaults to the one ledger every provisioner reads. Callers pass it
 * explicitly when they cannot rely on the ambient SUPERSET_HOME_DIR — a test
 * sharing a process with siblings that move the variable, most of all.
 */
export function readInstalledPluginSources(
	file: string = installedPluginsFilePath(),
): PluginSkillSource[] | null {
	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf-8");
	} catch (error) {
		return (error as NodeJS.ErrnoException)?.code === "ENOENT" ? [] : null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	const plugins = (parsed as { plugins?: unknown })?.plugins;
	if (!Array.isArray(plugins)) return null;

	const usable: { name: string; marketplace: string; dir: string }[] = [];
	for (const entry of plugins as InstalledPluginRecord[]) {
		if (entry?.enabled === false) continue;
		if (typeof entry?.name !== "string" || !entry.name) continue;
		if (typeof entry?.installPath !== "string" || !entry.installPath) continue;
		usable.push({
			name: entry.name,
			marketplace:
				typeof entry.marketplace === "string" ? entry.marketplace : "",
			dir: entry.installPath,
		});
	}

	const occurrences = new Map<string, number>();
	for (const entry of usable) {
		occurrences.set(entry.name, (occurrences.get(entry.name) ?? 0) + 1);
	}

	const taken = new Set<string>();
	for (const entry of usable) {
		if (occurrences.get(entry.name) === 1) taken.add(entry.name);
	}

	return usable.map((entry) => {
		if (occurrences.get(entry.name) === 1) {
			return { name: entry.name, dir: entry.dir };
		}
		const base = entry.marketplace
			? `${entry.marketplace}-${entry.name}`
			: entry.name;
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
		taken.add(name);
		return { name, dir: entry.dir };
	});
}
