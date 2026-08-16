import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
	type ParsedPluginManifest,
	PLUGIN_MANIFEST_FILENAME,
	parsePluginManifest,
} from "@superset/plugin-sdk/manifest";

const execFileAsync = promisify(execFile);

export function managedPluginsDir(): string {
	return path.join(homedir(), ".superset", "plugins");
}

export function managedPluginDir(pluginId: string): string {
	return path.join(managedPluginsDir(), pluginId);
}

export async function loadManifestFromDir(
	dir: string,
): Promise<ParsedPluginManifest> {
	const manifestPath = path.join(dir, PLUGIN_MANIFEST_FILENAME);
	let raw: string;
	try {
		raw = await readFile(manifestPath, "utf8");
	} catch {
		throw new Error(`No ${PLUGIN_MANIFEST_FILENAME} found in ${dir}`);
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Malformed ${PLUGIN_MANIFEST_FILENAME}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const parsed = parsePluginManifest(json);
	for (const entry of [parsed.manifest.server, parsed.manifest.app]) {
		if (entry && !existsSync(path.join(dir, entry))) {
			throw new Error(`Manifest entry "${entry}" does not exist in ${dir}`);
		}
	}
	return parsed;
}

export interface InstalledCheckout {
	parsed: ParsedPluginManifest;
	/** Directory the plugin will run from. */
	rootDir: string;
	sourceType: "link" | "path" | "git";
	source: string;
	sourceCommit: string | null;
}

/** Register a directory in place — the dev flow; no copy, edits apply on reload. */
export async function linkFromPath(dir: string): Promise<InstalledCheckout> {
	const absolute = path.resolve(dir);
	const parsed = await loadManifestFromDir(absolute);
	return {
		parsed,
		rootDir: absolute,
		sourceType: "link",
		source: absolute,
		sourceCommit: null,
	};
}

async function copyIntoManaged(
	sourceDir: string,
	pluginId: string,
): Promise<string> {
	const dest = managedPluginDir(pluginId);
	await rm(dest, { recursive: true, force: true });
	await cp(sourceDir, dest, {
		recursive: true,
		filter: (src) => path.basename(src) !== ".git",
	});
	return dest;
}

export async function installFromPath(dir: string): Promise<InstalledCheckout> {
	const absolute = path.resolve(dir);
	const parsed = await loadManifestFromDir(absolute);
	const rootDir = await copyIntoManaged(absolute, parsed.manifest.id);
	// Re-validate from the managed checkout so the running copy is what was
	// checked (entries present, manifest parseable after the copy).
	const finalParsed = await loadManifestFromDir(rootDir);
	return {
		parsed: finalParsed,
		rootDir,
		sourceType: "path",
		source: absolute,
		sourceCommit: null,
	};
}

export async function installFromGit(
	url: string,
	ref?: string,
): Promise<InstalledCheckout> {
	const tmp = await mkdtemp(path.join(tmpdir(), "superset-plugin-"));
	try {
		const cloneArgs = ["clone", "--depth", "1", "--quiet"];
		if (ref) cloneArgs.push("--branch", ref);
		cloneArgs.push(url, tmp);
		await execFileAsync("git", cloneArgs, { timeout: 120_000 });
		const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
			cwd: tmp,
			timeout: 10_000,
		});
		const sourceCommit = stdout.trim();
		const parsed = await loadManifestFromDir(tmp);
		const rootDir = await copyIntoManaged(tmp, parsed.manifest.id);
		const finalParsed = await loadManifestFromDir(rootDir);
		return {
			parsed: finalParsed,
			rootDir,
			sourceType: "git",
			source: url,
			sourceCommit,
		};
	} finally {
		await rm(tmp, { recursive: true, force: true }).catch(() => {});
	}
}

export async function removeManagedCheckout(pluginId: string): Promise<void> {
	const dir = managedPluginDir(pluginId);
	// Refuse to delete anything outside the managed root, however the id got mangled.
	if (!path.resolve(dir).startsWith(`${managedPluginsDir()}${path.sep}`))
		return;
	await rm(dir, { recursive: true, force: true });
}
