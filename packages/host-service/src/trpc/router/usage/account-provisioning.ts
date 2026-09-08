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
} from "./default-account.ts";
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
	// Best-effort, like the other two call sites of this provisioner: the dir is
	// created, owner-only, seeded and flagged by the time we get here, so a
	// failed refresh of skills/plugins/settings/session-share says nothing about
	// whether the credential swap is safe. Failing here would refuse the switch
	// without repairing anything, and a persistent fault (EPERM replacing a
	// symlink, ENOSPC on a merge) would disable account switching outright —
	// reported as `active-dir-unavailable`, which the dir plainly is not.
	// Provisioning retries on the next switch and at host boot.
	try {
		await (options.provision ?? provisionClaudeAccount)(dir);
	} catch (error) {
		console.warn(
			`[host-service] provisioning the active Claude dir ${dir} failed (continuing):`,
			error,
		);
	}
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
	provisionClaude?: (configDir: string) => Promise<void>;
	provisionCodex?: (codexHome: string) => Promise<void>;
}

/**
 * Re-shares the default account's config into the selected account. Runs at
 * host boot so the account agents actually launch on keeps up with skills,
 * plugins and settings added since it was selected.
 *
 * Only the pointer selection, never discovery. Provisioning is not a read: it
 * moves a dir's projects/, todos/ and sessions/ into ~/.claude and leaves
 * symlinks behind, appends its history.jsonl to the live one, and rewrites its
 * settings.json. Discovery answers "what logins exist on this host", so
 * fanning out over it did that to dirs the user never handed over — a
 * ~/.claude-backup, a scratch copy — and the displaced bytes are left in a
 * .superset-merge sidecar nothing drains.
 *
 * Nothing is lost by narrowing, because every path that hands Superset an
 * account already provisions that dir then and there: prepareAccount on the
 * add-account flow, setDefaultAccount on every switch the user makes, and the
 * account engine's own switch — ensureActiveClaudeDir for Claude,
 * provisionCodexAccount for Codex (account-engine.ts). A dir that arrived
 * outside the UI is provisioned the first time it is selected.
 */
export async function provisionSelectedAccounts(
	db: HostDb,
	deps: ProvisionAccountsDeps = {},
): Promise<void> {
	// Heal the wrapper pointer files first — a build predating them (or a
	// crashed switch) leaves agents launching on a stale spawn-time default.
	const { claudeConfigDir, codexHome } = getDefaultAccountSelections(db);
	const provisionClaude = deps.provisionClaude ?? provisionClaudeAccount;
	const provisionCodex = deps.provisionCodex ?? provisionCodexAccount;
	const targets: Array<readonly [string, () => Promise<unknown>]> = [];
	// A dir that has vanished is skipped, not recreated: agent launches
	// already fall back to the system-default login in that case.
	if (claudeConfigDir && existsSync(claudeConfigDir)) {
		targets.push([claudeConfigDir, () => provisionClaude(claudeConfigDir)]);
	}
	if (codexHome && existsSync(codexHome)) {
		targets.push([codexHome, () => provisionCodex(codexHome)]);
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
