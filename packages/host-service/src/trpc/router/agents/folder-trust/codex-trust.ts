import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { discoverCodexHomes } from "../../usage/profiles";
import { atomicWrite } from "./atomic-write";
import type { FolderTrustDecision, FolderTrustProvider } from "./types";

const CONFIG_FILE_NAME = "config.toml";

/**
 * A `projects` entry header, tolerating header spacing and both TOML string
 * styles (plus top-level dotted keys). Appending a duplicate table would make
 * the whole file unparseable for Codex, so detection must be broader than the
 * exact header Codex itself writes.
 */
const PROJECT_ENTRY =
	/^\s*\[?\s*projects\s*\.\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*[\].]/;

function projectEntryKey(line: string): string | undefined {
	const match = PROJECT_ENTRY.exec(line);
	if (!match) return undefined;
	return match[1] !== undefined
		? match[1].replace(/\\(["\\])/g, "$1")
		: match[2];
}

function tomlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * "trusted" only for the `[projects."<path>"]` table form Codex itself
 * writes, with `trust_level = "trusted"` inside it. Any other entry for the
 * path reads as "declined": an explicit "untrusted", or a spelling this does
 * not parse, is the user's and costs at most one dialog.
 */
export async function readCodexFolderTrust(
	configFile: string,
	folderPath: string,
): Promise<FolderTrustDecision> {
	let content: string;
	try {
		content = await readFile(configFile, "utf-8");
	} catch {
		return "none";
	}
	let decision: FolderTrustDecision = "none";
	let inTable = false;
	for (const line of content.split(/\r?\n/)) {
		if (projectEntryKey(line) === folderPath) {
			decision = "declined";
			inTable = /^\s*\[/.test(line);
			continue;
		}
		if (/^\s*\[/.test(line)) inTable = false;
		if (
			inTable &&
			/^\s*trust_level\s*=\s*["']trusted["']\s*(#.*)?$/.test(line)
		) {
			return "trusted";
		}
	}
	return decision;
}

/**
 * Append a `[projects."<path>"]` table with `trust_level = "trusted"` to a
 * Codex config.toml. An existing entry for the path is left untouched — a
 * user's explicit "untrusted" must not be overridden.
 */
export async function persistCodexFolderTrust(
	configFile: string,
	folderPath: string,
): Promise<void> {
	let content = "";
	if (existsSync(configFile)) {
		content = await readFile(configFile, "utf-8");
		if ((await readCodexFolderTrust(configFile, folderPath)) !== "none") return;
	} else if (!existsSync(dirname(configFile))) {
		return;
	}
	const block = `[projects.${tomlString(folderPath)}]\ntrust_level = "trusted"\n`;
	const next =
		content.length === 0 ? block : `${content.replace(/\n*$/, "\n\n")}${block}`;
	await atomicWrite(configFile, next);
}

/**
 * One `-c` for all folders: each `-c projects=` replaces the whole table for
 * the run, so a second flag would drop the first. It must precede any
 * subcommand (`codex -c … resume <id>`), which is where the launch builder
 * puts it. Verified on codex-cli 0.154.0.
 */
export function codexLaunchOverride(folderPaths: string[]): string[] {
	if (folderPaths.length === 0) return [];
	const entries = folderPaths.map(
		(folderPath) => `${tomlString(folderPath)}={trust_level="trusted"}`,
	);
	return ["-c", `projects={${entries.join(",")}}`];
}

export const codexFolderTrust: FolderTrustProvider = {
	family: "codex",
	storeFile: (env) =>
		join(env.CODEX_HOME || join(homedir(), ".codex"), CONFIG_FILE_NAME),
	discoverStoreFiles: async () =>
		(await discoverCodexHomes()).map(({ home }) =>
			join(home, CONFIG_FILE_NAME),
		),
	readDecision: readCodexFolderTrust,
	persist: persistCodexFolderTrust,
	launchOverride: codexLaunchOverride,
};
