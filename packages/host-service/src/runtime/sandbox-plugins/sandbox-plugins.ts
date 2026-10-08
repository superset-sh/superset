import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { cp, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	getBundledMarketplaceDir,
	type InstalledPluginEntry,
	pluginCachePath,
	writeInstalledPlugins,
} from "@superset/agent-setup";
import { DEFAULT_MARKETPLACE } from "@superset/shared/plugins";
import { sandboxPluginsSchema } from "@superset/shared/sandbox-contract";

function treeVersion(dir: string, fallback: string): string {
	try {
		const manifest = JSON.parse(
			readFileSync(join(dir, "plugin.json"), "utf8"),
		) as { version?: unknown };
		return typeof manifest.version === "string" ? manifest.version : fallback;
	} catch {
		return fallback;
	}
}

/**
 * The shipped tree lives under the host runtime directory, which is
 * root-owned and which install-host reaps on upgrade, so the ledger must point
 * at the same cache a laptop uses instead.
 */
async function cacheShippedTree(
	from: string,
	marketplace: string,
	name: string,
	version: string,
): Promise<string | undefined> {
	let target: string;
	try {
		target = pluginCachePath(marketplace, name, version);
	} catch (error) {
		console.warn(`[sandbox] ${name}: ${(error as Error).message}`);
		return undefined;
	}
	if (existsSync(join(target, "plugin.json"))) return target;
	// Staged, because cp publishes each file as it goes: a host that stops
	// mid-copy would otherwise leave a tree that looks cached forever.
	const staging = `${target}.incoming-${process.pid}`;
	try {
		mkdirSync(dirname(target), { recursive: true });
		await rm(staging, { recursive: true, force: true });
		await cp(from, staging, { recursive: true });
		try {
			await rename(staging, target);
		} catch (error) {
			if (!existsSync(join(target, "plugin.json"))) throw error;
			await rm(staging, { recursive: true, force: true });
		}
		return target;
	} catch (error) {
		await rm(staging, { recursive: true, force: true }).catch(() => {});
		console.warn(`[sandbox] ${name}: could not cache its tree:`, error);
		return undefined;
	}
}

export async function seedSandboxPlugins(
	env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
	const raw = env.SUPERSET_SANDBOX_PLUGINS;
	if (!raw) return;

	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		console.warn("[sandbox] SUPERSET_SANDBOX_PLUGINS is not JSON");
		return;
	}
	const parsed = sandboxPluginsSchema.safeParse(json);
	if (!parsed.success) {
		console.warn("[sandbox] SUPERSET_SANDBOX_PLUGINS is not a plugin list");
		return;
	}

	const root = getBundledMarketplaceDir();
	const installedAt = new Date().toISOString();
	const entries: InstalledPluginEntry[] = [];
	for (const plugin of parsed.data) {
		const dir = join(root, plugin.name);
		// Only the first-party trees ship in the bundle, so a same-named
		// plugin from another marketplace must stay tools-only.
		const shipped =
			plugin.marketplace === DEFAULT_MARKETPLACE &&
			existsSync(join(dir, "plugin.json"));
		const version = shipped ? treeVersion(dir, plugin.version) : plugin.version;
		const installPath = shipped
			? await cacheShippedTree(dir, plugin.marketplace, plugin.name, version)
			: undefined;
		entries.push({
			marketplace: plugin.marketplace,
			name: plugin.name,
			version,
			...(installPath ? { installPath } : {}),
			installedAt,
			enabled: plugin.enabled,
		});
	}

	writeInstalledPlugins(entries);
	const toolsOnly = entries.filter((entry) => !entry.installPath).length;
	console.log(
		`[sandbox] Seeded ${entries.length} plugin(s) into the ledger${
			toolsOnly ? ` (${toolsOnly} with no tree in this runtime)` : ""
		}`,
	);
}
