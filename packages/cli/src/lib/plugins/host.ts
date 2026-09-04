import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	installedPluginsFilePath,
	writeFileIfChanged,
} from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";
import { getSupersetHomeDir } from "../settings/paths";
import {
	assertSafeSegment,
	MARKETPLACE_FILE,
	type Marketplace,
} from "./marketplace";

export {
	DEFAULT_MARKETPLACE,
	DEFAULT_MARKETPLACE_REF,
	DEFAULT_MARKETPLACE_REPO,
} from "@superset/shared/plugins";
export { assertSafeSegment } from "./marketplace";

export interface MarketplaceSource {
	kind: "github" | "path";
	repo?: string;
	ref?: string;
	path?: string;
}

export interface KnownMarketplace {
	source: MarketplaceSource;
	installLocation: string;
	lastUpdated: string;
}

export interface InstalledPlugin {
	marketplace: string;
	name: string;
	version: string;
	installPath: string;
	installedAt: string;
	enabled: boolean;
}

export function supersetHome(): string {
	return getSupersetHomeDir();
}

export function pluginsRoot(): string {
	return path.join(supersetHome(), "plugins");
}

export function skillsRoot(): string {
	return path.join(os.homedir(), ".agents", "skills");
}

export function marketplacesDir(): string {
	return path.join(pluginsRoot(), "marketplaces");
}

export function cacheDir(): string {
	return path.join(pluginsRoot(), "cache");
}

function knownFile(): string {
	return path.join(pluginsRoot(), "known_marketplaces.json");
}

function installedFile(): string {
	return installedPluginsFilePath();
}

/**
 * A missing file is an empty ledger; an unreadable one is not. Returning the
 * fallback for a parse failure would let the next write replace a whole
 * machine's install list with the one entry that happened to be in hand.
 */
function readJsonFile<T>(file: string, fallback: T): T {
	if (!fs.existsSync(file)) return fallback;
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as T;
	} catch (error) {
		throw new CLIError(
			`${file} is not readable JSON, so it cannot be safely rewritten: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function writeJsonFile(file: string, value: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	// Temp-and-rename: the desktop, `plugins sync`, and one host-service per
	// organization all write this file, and a torn one reaps every skill.
	writeFileIfChanged(file, `${JSON.stringify(value, null, "\t")}\n`, 0o644);
}

export function readKnownMarketplaces(): Record<string, KnownMarketplace> {
	return readJsonFile<Record<string, KnownMarketplace>>(knownFile(), {});
}

export function writeKnownMarketplaces(
	value: Record<string, KnownMarketplace>,
): void {
	writeJsonFile(knownFile(), value);
}

export function readInstalledPlugins(): InstalledPlugin[] {
	const raw = readJsonFile<{ version: number; plugins: InstalledPlugin[] }>(
		installedFile(),
		{ version: 1, plugins: [] },
	);
	return raw.plugins ?? [];
}

export function writeInstalledPlugins(plugins: InstalledPlugin[]): void {
	writeJsonFile(installedFile(), { version: 1, plugins });
}

export function marketplaceManifest(name: string): Marketplace {
	const known = readKnownMarketplaces()[name];
	if (!known) {
		throw new CLIError(
			`Marketplace "${name}" is not installed. Run: superset plugins marketplace add <owner/repo>`,
		);
	}
	const file = path.join(known.installLocation, MARKETPLACE_FILE);
	if (!fs.existsSync(file)) {
		throw new CLIError(
			`Marketplace "${name}" has no ${MARKETPLACE_FILE} at ${known.installLocation}.`,
		);
	}
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as Marketplace;
	} catch (error) {
		throw new CLIError(
			`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function pluginCachePath(
	marketplace: string,
	name: string,
	version: string,
): string {
	return path.join(
		cacheDir(),
		assertSafeSegment(marketplace, "marketplace"),
		assertSafeSegment(name, "plugin name"),
		assertSafeSegment(version, "version"),
	);
}

export function findInstalled(
	plugins: InstalledPlugin[],
	name: string,
	marketplace?: string,
): InstalledPlugin | undefined {
	const matches = plugins.filter(
		(p) => p.name === name && (!marketplace || p.marketplace === marketplace),
	);
	if (matches.length > 1) {
		throw new CLIError(
			`"${name}" is installed from ${matches.map((p) => p.marketplace).join(", ")}.`,
			`Name one with --marketplace <name>, or ${name}@<marketplace>.`,
		);
	}
	return matches[0];
}

export function parsePluginRef(ref: string): {
	name: string;
	marketplace?: string;
} {
	const at = ref.lastIndexOf("@");
	if (at <= 0) return { name: ref };
	return { name: ref.slice(0, at), marketplace: ref.slice(at + 1) };
}

export function resolvePluginRef(
	ref: string,
	marketplace?: string,
): { name: string; marketplace?: string } {
	const parsed = parsePluginRef(ref);
	if (parsed.marketplace && marketplace && parsed.marketplace !== marketplace) {
		throw new CLIError(
			`"${ref}" names marketplace "${parsed.marketplace}" but --marketplace says "${marketplace}". Pass one or the other.`,
		);
	}
	return { name: parsed.name, marketplace: marketplace ?? parsed.marketplace };
}
