/**
 * Keeps the selected agent accounts provisioned — see
 * packages/agent-setup/src/provider-profiles.ts for what that means. Split
 * from default-account.ts so the terminal's env-resolution path (loaded by
 * node --test) doesn't pull the whole agent-setup surface in.
 */

import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	provisionClaudeProfile,
	provisionCodexProfile,
	resolveAmbientCodexHome,
} from "@superset/agent-setup";
import type { HostDb } from "../../../db/index.ts";
import { updateClaudeStateFile } from "./claude-state-file.ts";
import {
	activeClaudeConfigDirPath,
	getDefaultAccountSelections,
	syncDefaultAccountPointers,
} from "./default-account.ts";
import { discoverClaudeProfiles, discoverCodexHomes } from "./profiles.ts";
import {
	shareClaudeSessionState,
	shareCodexSessionState,
} from "./session-share.ts";

/**
 * Everything a Claude account needs on this host: the shared session state
 * (one `--resume` history across accounts — session-share.ts) plus the
 * config surfaces agent-setup owns (skills, plugins, settings, MCP servers).
 */
export async function provisionClaudeAccount(configDir: string): Promise<void> {
	shareClaudeSessionState(configDir, join(homedir(), ".claude"));
	await provisionClaudeProfile(configDir);
}

/**
 * The Superset-owned Claude config dir that account switching swaps logins
 * into (KTD2). It is the one dir whose credentials Superset writes: `~/.claude`
 * and the user's own profile dirs stay the vault of logins, so Claude runs
 * outside Superset keep working.
 */
export function activeClaudeConfigDir(): string {
	return activeClaudeConfigDirPath();
}

/**
 * Creates the active dir owner-only and brings it up to date like any other
 * profile — shared session history, skills, plugins, settings, MCP servers —
 * so a session that moves onto it keeps its `--resume` history.
 *
 * `seedLogin` puts the login of the account that is active today into a
 * brand-new dir (the system default's store, per KTD14, unless the caller
 * names another). It is injected rather than imported so this module stays
 * clear of the account engine, and it runs before provisioning: the state
 * file it writes is what lets provisioning force `hasCompletedOnboarding`,
 * whose absence opens the first-boot wizard on the dir's first launch.
 */
export async function ensureActiveClaudeDir(
	options: {
		seedLogin?: (activeDir: string) => Promise<void>;
		/** Injectable for the same reason the boot pass injects its
		 * provisioners: the real one shares session state into the caller's
		 * own ~/.claude, which a test must not touch. */
		provision?: (activeDir: string) => Promise<void>;
	} = {},
): Promise<string> {
	const dir = activeClaudeConfigDir();
	await mkdir(dir, { recursive: true, mode: 0o700 });
	await chmod(dir, 0o700);
	// No state file means no login has ever been swapped into this dir.
	const statePath = join(dir, ".claude.json");
	if (options.seedLogin && !existsSync(statePath)) {
		await options.seedLogin(dir);
	}
	// Provisioning forces `hasCompletedOnboarding` by merging into a state file
	// that already exists, so a dir reaching it without one keeps neither. The
	// first activation is exactly that case: it passes no `seedLogin` and the
	// engine seeds identity afterwards, which writes only `oauthAccount` and
	// `userID`. The dir is published to the pointer in between, so its first
	// launch would open the first-boot wizard — where a stray Enter starts a
	// login that silently rebinds the profile — until the next host restart
	// re-provisioned it. Superset owns this dir, so the flag is ours to state.
	if (!existsSync(statePath)) {
		await updateClaudeStateFile(statePath, (state) => ({
			...state,
			hasCompletedOnboarding: true,
		}));
	}
	await (options.provision ?? provisionClaudeAccount)(dir);
	return dir;
}

/**
 * The Codex twin. Both agents get session sharing: an account switch that
 * keeps `--resume` for Claude but drops `codex resume` is the same bug twice.
 * The share target is the same home `discoverCodexHomes` calls the system
 * default, so the account the UI labels default is the one sessions pool into.
 */
export async function provisionCodexAccount(codexHome: string): Promise<void> {
	shareCodexSessionState(codexHome, resolveAmbientCodexHome());
	await provisionCodexProfile(codexHome);
}

/** Injectable so the boot pass can be tested without a real home dir or the
 * agent-setup provisioners running against it. */
export interface ProvisionAccountsDeps {
	discoverClaudeDirs?: () => Promise<string[]>;
	discoverCodexDirs?: () => Promise<string[]>;
	provisionClaude?: (configDir: string) => Promise<void>;
	provisionCodex?: (codexHome: string) => Promise<void>;
}

/** Every Claude profile dir on this host. The active dir is not among them:
 * discovery excludes it (KTD4), and the pointer contributes it instead. */
async function discoverClaudeProfileDirs(): Promise<string[]> {
	return (await discoverClaudeProfiles()).map((profile) => profile.configDir);
}

/** Every Codex home except the system default, which is the share's source
 * and can never be its target (see session-share.ts). */
async function discoverCodexProfileDirs(): Promise<string[]> {
	const ambient = resolveAmbientCodexHome();
	return (await discoverCodexHomes())
		.map((home) => home.home)
		.filter((home) => home !== ambient);
}

/**
 * Re-shares the default account's config into every account on this host.
 * Runs at host boot so a profile keeps up with skills, plugins, and settings
 * added since it was selected, and so one provisioned by an older build — or
 * by a switch that failed halfway — is repaired before the next agent
 * launches on it.
 *
 * Every discovered profile dir is provisioned, not only the one the pointer
 * names (KTD2): from the first login swap onwards the pointer names the
 * Superset-owned active dir, and provisioning only that would leave every
 * account added since without shared session history.
 */
export async function provisionSelectedAccounts(
	db: HostDb,
	deps: ProvisionAccountsDeps = {},
): Promise<void> {
	// Heal the wrapper pointer files first — a build predating them (or a
	// crashed switch) leaves agents launching on a stale spawn-time default.
	syncDefaultAccountPointers(db);
	const { claudeConfigDir, codexHome } = getDefaultAccountSelections(db);
	const provisionClaude = deps.provisionClaude ?? provisionClaudeAccount;
	const provisionCodex = deps.provisionCodex ?? provisionCodexAccount;
	// Discovery answers "what logins exist on this host", which is a wider
	// question than "what has Superset been handed". Provisioning is not a
	// read: it moves the dir's projects/, todos/ and sessions/ into ~/.claude
	// and leaves symlinks behind, appends its history.jsonl to the live one,
	// and rewrites its settings.json. Doing that at boot to a dir the user
	// never selected — a ~/.claude-backup, a scratch copy — destroys the
	// isolation the directory existed for, and the displaced bytes are left in
	// a .superset-merge sidecar nothing ever drains.
	//
	// So the boot pass repairs what Superset already owns and nothing else: the
	// pointer selection, and any discovered dir already carrying the
	// provisioning ledger from a previous pass. A dir Superset has never
	// touched is left to the user-initiated path, which provisions it the
	// moment the account is actually selected.
	// agent-setup's PROFILE_LEDGER_NAME, which provisionClaudeProfile writes
	// into every dir it touches. Spelled out rather than imported because the
	// name is not on that package's public surface.
	const provisionedBefore = (dir: string): boolean =>
		existsSync(join(dir, ".superset-profile.json"));
	const claudeDirs = new Set([
		...(claudeConfigDir ? [claudeConfigDir] : []),
		...(await (deps.discoverClaudeDirs ?? discoverClaudeProfileDirs)()).filter(
			provisionedBefore,
		),
	]);
	const codexHomes = new Set([
		...(codexHome ? [codexHome] : []),
		...(await (deps.discoverCodexDirs ?? discoverCodexProfileDirs)()).filter(
			provisionedBefore,
		),
	]);
	const targets: Array<readonly [string, () => Promise<unknown>]> = [];
	// A dir that has vanished is skipped, not recreated: agent launches
	// already fall back to the system-default login in that case.
	for (const dir of claudeDirs) {
		if (existsSync(dir)) targets.push([dir, () => provisionClaude(dir)]);
	}
	for (const dir of codexHomes) {
		if (existsSync(dir)) targets.push([dir, () => provisionCodex(dir)]);
	}
	for (const [dir, provision] of targets) {
		try {
			await provision();
		} catch (error) {
			console.warn(
				`[host-service] provisioning the account ${dir} failed (continuing):`,
				error,
			);
		}
	}
}
