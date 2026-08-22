/**
 * Auto-discovery of extra AI CLI logins — the homes users point
 * CLAUDE_CONFIG_DIR / CODEX_HOME at for multi-account setups (runway's
 * discovery model, ported from its ClaudeConfigDirDiscovery):
 *
 * - Candidates are dot-dirs at `~` plus dirs under `~/.config` — bounded,
 *   never temp dirs or project trees.
 * - A Claude candidate counts only when its own `.claude.json` names an
 *   OAuth account ("identity-extraction-is-validation" — keeps forks and
 *   sandbox homes out). Custom config dirs keep state INSIDE the dir; only
 *   the default `~/.claude` keeps it next door at `~/.claude.json`.
 * - Credentials come from the dir's `.credentials.json` or its per-profile
 *   Keychain item: Claude Code hashes the literal CLAUDE_CONFIG_DIR string,
 *   so the service is `Claude Code-credentials-<sha256(literal)[0..8)>` and
 *   several path spellings must be probed (`~/x` vs absolute differ).
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SCAN_TIME_BUDGET_MS = 1_500;
const MAX_STATE_FILE_BYTES = 50 * 1024 * 1024;

export interface ClaudeProfile {
	/** Absolute config dir path (the CLAUDE_CONFIG_DIR value's expansion). */
	configDir: string;
	/** `~`-relative label for display. */
	sourceLabel: string;
	email: string | null;
	credentialsPath: string;
	/** Keychain service names to probe when the file has no token. */
	keychainServices: string[];
}

export interface CodexHome {
	home: string;
	sourceLabel: string;
}

function tildeLabel(path: string): string {
	return path.replace(homedir(), "~");
}

function hashSuffix(literal: string): string {
	return createHash("sha256")
		.update(literal.normalize("NFC"), "utf8")
		.digest("hex")
		.slice(0, 8);
}

/** Every plausible spelling Claude Code might have hashed for this dir. */
export function keychainServicesForConfigDir(configDir: string): string[] {
	const home = homedir();
	const spellings = new Set<string>([configDir]);
	if (configDir.startsWith(home)) {
		spellings.add(`~${configDir.slice(home.length)}`);
		spellings.add(`$HOME${configDir.slice(home.length)}`);
	}
	if (configDir.endsWith("/")) spellings.add(configDir.slice(0, -1));
	else spellings.add(`${configDir}/`);
	return [...spellings].map(
		(spelling) => `Claude Code-credentials-${hashSuffix(spelling)}`,
	);
}

async function listSubdirectories(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(dir, entry.name));
	} catch {
		return [];
	}
}

async function candidateDirectories(): Promise<string[]> {
	const home = homedir();
	const dotDirs = (await listSubdirectories(home)).filter((path) =>
		path.slice(home.length + 1).startsWith("."),
	);
	const configDirs = await listSubdirectories(join(home, ".config"));
	return [...dotDirs, ...configDirs].sort();
}

interface ClaudeStateFile {
	oauthAccount?: { emailAddress?: string; accountUuid?: string };
}

async function readClaudeIdentity(
	configDir: string,
): Promise<{ email: string | null } | null> {
	const statePath = join(configDir, ".claude.json");
	try {
		const info = await stat(statePath);
		if (!info.isFile() || info.size > MAX_STATE_FILE_BYTES) return null;
		const parsed: ClaudeStateFile = JSON.parse(
			await readFile(statePath, "utf-8"),
		);
		const account = parsed.oauthAccount;
		if (!account?.accountUuid && !account?.emailAddress) return null;
		return { email: account.emailAddress ?? null };
	} catch {
		return null;
	}
}

/**
 * Extra Claude profile dirs beyond the defaults. Default homes are excluded —
 * callers already cover `~/.claude` and `~/.config/claude`.
 */
export async function discoverClaudeProfiles(): Promise<ClaudeProfile[]> {
	const home = homedir();
	const excluded = new Set([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	const started = Date.now();
	const profiles: ClaudeProfile[] = [];

	for (const candidate of await candidateDirectories()) {
		if (Date.now() - started > SCAN_TIME_BUDGET_MS) break;
		if (excluded.has(candidate)) continue;
		const identity = await readClaudeIdentity(candidate);
		if (!identity) continue;
		profiles.push({
			configDir: candidate,
			sourceLabel: tildeLabel(candidate),
			email: identity.email,
			credentialsPath: join(candidate, ".credentials.json"),
			keychainServices: keychainServicesForConfigDir(candidate),
		});
	}
	return profiles;
}

/** Reads one keychain service's secret; null when absent or non-darwin. */
export async function readKeychainSecret(
	service: string,
): Promise<string | null> {
	if (platform() !== "darwin") return null;
	try {
		const { stdout } = await execFileAsync(
			"security",
			["find-generic-password", "-s", service, "-w"],
			{ timeout: 5_000 },
		);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

interface CodexAuthShape {
	tokens?: { access_token?: string };
}

/**
 * Codex homes: `$CODEX_HOME` (default `~/.codex`) plus any `~/.codex*`
 * dot-dir carrying an `auth.json` with a token — the common multi-account
 * convention is one CODEX_HOME dir per account.
 */
export async function discoverCodexHomes(): Promise<CodexHome[]> {
	const home = homedir();
	const defaultHome = process.env.CODEX_HOME ?? join(home, ".codex");
	const homes = new Map<string, CodexHome>([
		[defaultHome, { home: defaultHome, sourceLabel: tildeLabel(defaultHome) }],
	]);

	const candidates = (await listSubdirectories(home)).filter((path) =>
		path.slice(home.length + 1).startsWith(".codex"),
	);
	for (const candidate of candidates) {
		if (homes.has(candidate)) continue;
		try {
			const parsed: CodexAuthShape = JSON.parse(
				await readFile(join(candidate, "auth.json"), "utf-8"),
			);
			if (!parsed.tokens?.access_token) continue;
			homes.set(candidate, {
				home: candidate,
				sourceLabel: tildeLabel(candidate),
			});
		} catch {
			// No parsable auth.json — not a Codex home.
		}
	}
	return [...homes.values()];
}
