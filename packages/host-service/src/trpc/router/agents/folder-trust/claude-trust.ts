import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { discoverClaudeProfiles } from "../../usage/profiles";
import { atomicWrite } from "./atomic-write";
import type { FolderTrustDecision, FolderTrustProvider } from "./types";

const STATE_FILE_NAME = ".claude.json";

/**
 * `false` is Claude's default scaffold value ("dialog never accepted"), not a
 * recorded decline — the CLI persists no decline state (declining just
 * exits). So Claude never reports "declined".
 */
export async function readClaudeFolderTrust(
	stateFile: string,
	folderPath: string,
): Promise<FolderTrustDecision> {
	try {
		const state = JSON.parse(await readFile(stateFile, "utf-8"));
		return state?.projects?.[folderPath]?.hasTrustDialogAccepted === true
			? "trusted"
			: "none";
	} catch {
		return "none";
	}
}

/**
 * Merge `projects[<path>].hasTrustDialogAccepted: true` into a Claude state
 * file, preserving every other key. A corrupt file throws instead of being
 * clobbered. No-op when the entry is already trusted.
 */
export async function persistClaudeFolderTrust(
	stateFile: string,
	folderPath: string,
): Promise<void> {
	let state: Record<string, unknown> = {};
	if (existsSync(stateFile)) {
		state = JSON.parse(await readFile(stateFile, "utf-8"));
	} else if (!existsSync(dirname(stateFile))) {
		// A missing config dir means this login was never set up — the CLI's
		// own onboarding (which includes trust) will run anyway.
		return;
	}
	const projects = (state.projects ?? {}) as Record<
		string,
		Record<string, unknown> | undefined
	>;
	const existing = projects[folderPath];
	if (existing?.hasTrustDialogAccepted === true) return;
	state.projects = {
		...projects,
		[folderPath]: { ...existing, hasTrustDialogAccepted: true },
	};
	await atomicWrite(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Claude has no per-launch trust flag for interactive sessions (only `-p` and
 * non-TTY runs skip the dialog), so its store is the only lever: the CLI's
 * own untrusted-folder error names this key as the sanctioned escape hatch.
 * Live sessions re-read the file before rewriting it, so a seed written while
 * other agents run on the same account survives (verified on 2.1.277).
 */
export const claudeFolderTrust: FolderTrustProvider = {
	family: "claude",
	// State lives inside a custom CLAUDE_CONFIG_DIR but next door at
	// `~/.claude.json` for the default home.
	storeFile: (env) => join(env.CLAUDE_CONFIG_DIR || homedir(), STATE_FILE_NAME),
	discoverStoreFiles: async () => [
		join(homedir(), STATE_FILE_NAME),
		...(await discoverClaudeProfiles()).map((profile) =>
			join(profile.configDir, STATE_FILE_NAME),
		),
	],
	readDecision: readClaudeFolderTrust,
	persist: persistClaudeFolderTrust,
};
