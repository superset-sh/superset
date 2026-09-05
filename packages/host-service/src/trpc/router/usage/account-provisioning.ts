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
	resolveSupersetHomeDir,
} from "@superset/agent-setup";
import type { HostDb } from "../../../db/index.ts";
import {
	getDefaultAccountSelections,
	syncDefaultAccountPointers,
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
	return join(resolveSupersetHomeDir(), "accounts", "claude-active");
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
	options: { seedLogin?: (activeDir: string) => Promise<void> } = {},
): Promise<string> {
	const dir = activeClaudeConfigDir();
	await mkdir(dir, { recursive: true, mode: 0o700 });
	await chmod(dir, 0o700);
	// No state file means no login has ever been swapped into this dir.
	if (options.seedLogin && !existsSync(join(dir, ".claude.json"))) {
		await options.seedLogin(dir);
	}
	await provisionClaudeAccount(dir);
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

/**
 * Re-shares the default account's config into whichever profiles are
 * currently selected. Runs at host boot so a profile keeps up with skills,
 * plugins, and settings added since it was selected, and so one provisioned
 * by an older build — or by a switch that failed halfway — is repaired
 * before the next agent launches on it.
 */
export async function provisionSelectedAccounts(db: HostDb): Promise<void> {
	// Heal the wrapper pointer files first — a build predating them (or a
	// crashed switch) leaves agents launching on a stale spawn-time default.
	syncDefaultAccountPointers(db);
	const { claudeConfigDir, codexHome } = getDefaultAccountSelections(db);
	const targets: Array<readonly [string, () => Promise<unknown>]> = [];
	// A pointer at a vanished dir is skipped, not recreated: agent launches
	// already fall back to the system-default login in that case.
	if (claudeConfigDir && existsSync(claudeConfigDir)) {
		targets.push([
			claudeConfigDir,
			() => provisionClaudeAccount(claudeConfigDir),
		]);
	}
	if (codexHome && existsSync(codexHome)) {
		targets.push([codexHome, () => provisionCodexAccount(codexHome)]);
	}
	for (const [dir, provision] of targets) {
		try {
			await provision();
		} catch (error) {
			console.warn(
				`[host-service] provisioning the selected account ${dir} failed (continuing):`,
				error,
			);
		}
	}
}
