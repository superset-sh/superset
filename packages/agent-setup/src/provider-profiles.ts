/**
 * Makes a provider account (a CLAUDE_CONFIG_DIR / CODEX_HOME profile dir) a
 * complete environment rather than a bare login.
 *
 * The CLIs read *everything* — skills, plugins, subagents, commands, MCP
 * servers, settings — from their active config dir, so pointing one at a
 * second dir to switch accounts also swapped the user's whole setup for an
 * empty one. Provisioning shares each of those surfaces from the default
 * account (see profile-sharing.ts for the link/sync/merge rules) and leaves
 * exactly one thing per-account: the login, plus the transcript and session
 * state that belongs to it.
 *
 * Idempotent and safe to re-run: it is called when an account is added, when
 * one is selected, and for the selected accounts at host boot.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ensureClaudeManagedHooksAt,
	ensureCodexManagedHooksAt,
} from "./agent-wrappers-claude-codex-opencode";
import { provisionManagedClaudePluginAt } from "./managed-skills";
import {
	linkSharedDir,
	mergeSharedJsonKeys,
	readProfileLedger,
	type SurfaceOutcome,
	syncSharedFile,
	writeProfileLedger,
} from "./profile-sharing";

export interface ProfileProvisionReport {
	configDir: string;
	/** Surface name -> what provisioning did with it, for setup logs. */
	surfaces: Record<string, SurfaceOutcome>;
}

export interface ProvisionProfileOptions {
	/** Overridden in tests; the real home in every other caller. */
	homeDir?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Real path when the dir exists, plain resolution otherwise — a symlink
 * alias of a protected dir must compare equal to it. */
function canonical(target: string): string {
	try {
		return fs.realpathSync(target);
	} catch {
		return path.resolve(target);
	}
}

/**
 * True for the share's source and the other default homes — provisioning a
 * default home would link it into itself (discovery excludes them, but a
 * CLAUDE_CONFIG_DIR env entry can name one directly, including via symlink).
 */
function isProtectedTarget(
	target: string,
	homeDir: string,
	defaultDir: string,
): boolean {
	const resolved = canonical(target);
	const protectedDirs = [
		homeDir,
		defaultDir,
		path.join(homeDir, ".config"),
		path.join(homeDir, ".config", "claude"),
	];
	return protectedDirs.some((dir) => resolved === canonical(dir));
}

function logReport(provider: string, report: ProfileProvisionReport): void {
	const summary = Object.entries(report.surfaces)
		.map(([surface, outcome]) => `${surface}=${outcome}`)
		.join(" ");
	console.log(
		`[agent-setup] Provisioned ${provider} account ${report.configDir}: ${summary}`,
	);
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

/**
 * Directories shared by symlink. Everything Claude Code loads as user-level
 * capability lives in one of these; what's left in a config dir is the login
 * and its own history (projects/, sessions/, shell-snapshots/, …).
 */
const CLAUDE_SHARED_DIRS = [
	"skills",
	"plugins",
	"agents",
	"commands",
	"output-styles",
] as const;

/** Files copied verbatim (the CLI rename-replaces them, so no symlink). */
const CLAUDE_SHARED_FILES = ["CLAUDE.md"] as const;

/**
 * settings.json keys that must NOT follow the account. Everything else is
 * shared by default so a key added by a future CLI release comes along
 * without a code change here.
 */
const CLAUDE_PRIVATE_SETTINGS_KEYS = new Set([
	// Provisioned per profile right after the merge — the hooks are identical,
	// but they are ours to write, not the user's to share.
	"hooks",
	// Auth resolution: sharing these would let one account's credential
	// mechanism silently answer for another.
	"apiKeyHelper",
	"awsAuthRefresh",
	"awsCredentialExport",
	"forceLoginMethod",
	"forceLoginOrgUUID",
]);

/** `env` entries holding a credential; the rest of `env` is shared. */
const CLAUDE_PRIVATE_ENV_KEYS = new Set([
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"CLAUDE_CODE_OAUTH_TOKEN",
]);

/**
 * `.claude.json` keys that are shared — an allowlist, inverted from
 * settings.json on purpose: that file is mostly identity (oauthAccount,
 * userID), per-project transcript history, and server-driven caches, none of
 * which may cross accounts.
 */
const CLAUDE_SHARED_STATE_KEYS = ["mcpServers", "theme"] as const;

function pickClaudeSettings(
	source: Record<string, unknown>,
): Record<string, unknown> {
	const shared: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (CLAUDE_PRIVATE_SETTINGS_KEYS.has(key)) continue;
		if (key === "env" && isPlainObject(value)) {
			shared.env = Object.fromEntries(
				Object.entries(value).filter(
					([name]) => !CLAUDE_PRIVATE_ENV_KEYS.has(name),
				),
			);
			continue;
		}
		shared[key] = value;
	}
	return shared;
}

function pickClaudeState(
	source: Record<string, unknown>,
): Record<string, unknown> {
	const shared: Record<string, unknown> = {};
	for (const key of CLAUDE_SHARED_STATE_KEYS) {
		if (key in source) shared[key] = source[key];
	}
	return shared;
}

/**
 * Brings one Claude config dir up to date with the default account. A no-op
 * for `~/.claude` itself, which is the source of every share.
 */
export async function provisionClaudeProfile(
	configDir: string,
	options: ProvisionProfileOptions = {},
): Promise<ProfileProvisionReport> {
	const homeDir = options.homeDir ?? os.homedir();
	const defaultDir = path.join(homeDir, ".claude");
	const target = path.resolve(configDir);
	const surfaces: Record<string, SurfaceOutcome> = {};
	if (isProtectedTarget(target, homeDir, defaultDir)) {
		return { configDir: target, surfaces };
	}

	fs.mkdirSync(target, { recursive: true });
	const ledger = readProfileLedger(target, defaultDir);

	for (const name of CLAUDE_SHARED_DIRS) {
		surfaces[`${name}/`] = linkSharedDir(
			path.join(defaultDir, name),
			path.join(target, name),
		);
	}
	for (const name of CLAUDE_SHARED_FILES) {
		surfaces[name] = syncSharedFile({
			sourcePath: path.join(defaultDir, name),
			targetPath: path.join(target, name),
			surface: name,
			ledger,
		});
	}

	surfaces["settings.json"] = mergeSharedJsonKeys({
		sourcePath: path.join(defaultDir, "settings.json"),
		targetPath: path.join(target, "settings.json"),
		surface: "settings.json",
		ledger,
		pick: pickClaudeSettings,
	});

	// Only the default account keeps its state next door at `~/.claude.json`;
	// a custom config dir keeps it inside.
	surfaces[".claude.json"] = mergeSharedJsonKeys({
		sourcePath: path.join(homeDir, ".claude.json"),
		targetPath: path.join(target, ".claude.json"),
		surface: ".claude.json",
		ledger,
		pick: pickClaudeState,
		// Without this the profile's first launch opens the first-boot wizard,
		// where a stray Enter starts a login that silently rebinds the profile.
		force: { hasCompletedOnboarding: true },
		// No parsable state file means no completed login yet — writing one
		// would fabricate an account that doesn't exist.
		requireExistingTarget: true,
	});

	writeProfileLedger(target, ledger);
	// After the settings merge: the merge only writes shared keys, and the
	// hook entries have to survive it.
	ensureClaudeManagedHooksAt(target);

	if (surfaces["skills/"] === "user-owned") {
		// The profile brought its own skills dir, so it isn't sharing ours —
		// the bundled Superset plugin has to be written into it directly.
		await provisionManagedClaudePluginAt(target);
		surfaces["skills/superset"] = "synced";
	}

	const report = { configDir: target, surfaces };
	logReport("Claude", report);
	return report;
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

/** `prompts/` holds custom slash-command prompts; the rest of a Codex home
 * is auth, history, and rollouts. */
const CODEX_SHARED_DIRS = ["prompts"] as const;

/**
 * `config.toml` carries the model, approval policy, and MCP servers;
 * `AGENTS.md` the global instructions. Neither holds credentials — Codex
 * keeps those in `auth.json`, which stays per-account.
 */
const CODEX_SHARED_FILES = ["config.toml", "AGENTS.md"] as const;

function defaultCodexHome(homeDir: string, homeDirOverridden: boolean): string {
	// An overridden homeDir (tests) must win over the ambient CODEX_HOME, or
	// the provision would share from the real machine's Codex home.
	if (homeDirOverridden) return path.join(homeDir, ".codex");
	const fromEnv = process.env.CODEX_HOME?.trim();
	return fromEnv ? path.resolve(fromEnv) : path.join(homeDir, ".codex");
}

/** Brings one Codex home up to date with the default one. */
export async function provisionCodexProfile(
	home: string,
	options: ProvisionProfileOptions = {},
): Promise<ProfileProvisionReport> {
	const homeDir = options.homeDir ?? os.homedir();
	const defaultDir = defaultCodexHome(homeDir, options.homeDir !== undefined);
	const target = path.resolve(home);
	const surfaces: Record<string, SurfaceOutcome> = {};
	if (isProtectedTarget(target, homeDir, defaultDir)) {
		return { configDir: target, surfaces };
	}

	fs.mkdirSync(target, { recursive: true });
	const ledger = readProfileLedger(target, defaultDir);

	for (const name of CODEX_SHARED_DIRS) {
		surfaces[`${name}/`] = linkSharedDir(
			path.join(defaultDir, name),
			path.join(target, name),
		);
	}
	for (const name of CODEX_SHARED_FILES) {
		surfaces[name] = syncSharedFile({
			sourcePath: path.join(defaultDir, name),
			targetPath: path.join(target, name),
			surface: name,
			ledger,
		});
	}

	writeProfileLedger(target, ledger);
	ensureCodexManagedHooksAt(target);

	const report = { configDir: target, surfaces };
	logReport("Codex", report);
	return report;
}
