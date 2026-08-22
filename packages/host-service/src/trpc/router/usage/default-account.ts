/**
 * Host-wide default provider account for newly launched agents. "Switching"
 * an account never touches credential stores — it only records which profile
 * dir to inject (CLAUDE_CONFIG_DIR / CODEX_HOME) when an agent starts, so the
 * provider CLI itself keeps owning every login end to end.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import { hostSettings } from "../../../db/schema.ts";
import type { UsageProvider } from "./types.ts";

const POINTER_NAMES: Record<UsageProvider, string> = {
	claude: "default-claude-config-dir",
	codex: "default-codex-home",
};

/**
 * Mirror of agent-setup's resolveSupersetHomeDir, not imported: this module
 * sits on the terminal env-resolution path (loaded by node --test) and must
 * stay free of the agent-setup surface — see account-provisioning.ts.
 */
function supersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
}

/**
 * Publishes a selection where the agent wrappers can re-read it on every
 * launch (buildDefaultAccountResolver in agent-setup), so switching accounts
 * reaches existing terminals the next time the agent starts — the PTY env
 * alone is frozen at spawn. Empty file = system default. Best-effort: the DB
 * stays the source of truth and the wrapper falls back to the spawn-time env.
 */
export function syncDefaultAccountPointer(
	provider: UsageProvider,
	selection: string | null,
): void {
	try {
		const dir = join(supersetHomeDir(), "state");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, POINTER_NAMES[provider]), selection ?? "");
	} catch {
		// Wrapper keeps using the spawn-time env until the next successful sync.
	}
}

/** Reconciles both pointer files from the DB — run at host boot so files
 * from an older build (or a crashed switch) heal. */
export function syncDefaultAccountPointers(db: HostDb): void {
	const selections = getDefaultAccountSelections(db);
	syncDefaultAccountPointer("claude", selections.claudeConfigDir);
	syncDefaultAccountPointer("codex", selections.codexHome);
}

export interface DefaultAccountSelections {
	/** CLAUDE_CONFIG_DIR to inject, or null for the system-default login. */
	claudeConfigDir: string | null;
	/** CODEX_HOME to inject, or null for the system-default login. */
	codexHome: string | null;
}

export function getDefaultAccountSelections(
	db: HostDb,
): DefaultAccountSelections {
	const row = db.select().from(hostSettings).get();
	return {
		claudeConfigDir: row?.defaultClaudeConfigDir ?? null,
		codexHome: row?.defaultCodexHome ?? null,
	};
}

export function setDefaultAccountSelection(
	db: HostDb,
	provider: UsageProvider,
	selection: string | null,
): void {
	const values =
		provider === "claude"
			? { defaultClaudeConfigDir: selection }
			: { defaultCodexHome: selection };
	db.insert(hostSettings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: hostSettings.id, set: values })
		.run();
	syncDefaultAccountPointer(provider, selection);
}

/**
 * Env for a new terminal so provider CLIs typed or launched in it run on the
 * host-default accounts. Both providers' vars — a shell can run either CLI.
 * Baked at PTY spawn as the fast path; the agent wrappers re-resolve from the
 * pointer files at every launch, so a later switch still reaches this
 * terminal when the agent is relaunched.
 */
export function resolveDefaultAccountTerminalEnv(
	db: HostDb,
): Record<string, string> {
	return {
		...resolveDefaultAccountEnv(db, "claude"),
		...resolveDefaultAccountEnv(db, "codex"),
	};
}

/**
 * Env to overlay on an agent launch so it runs on the host-default account.
 * A pointer whose profile dir has vanished is skipped: falling back to the
 * system-default login beats booting the agent signed out.
 */
export function resolveDefaultAccountEnv(
	db: HostDb,
	presetId: string,
): Record<string, string> {
	if (presetId !== "claude" && presetId !== "codex") return {};
	const selections = getDefaultAccountSelections(db);
	if (
		presetId === "claude" &&
		selections.claudeConfigDir &&
		existsSync(selections.claudeConfigDir)
	) {
		// The SUPERSET_DEFAULT_* twin marks the value as Superset-injected, so
		// the agent wrapper can re-resolve a later switch without ever
		// overriding a value the user exported by hand.
		return {
			CLAUDE_CONFIG_DIR: selections.claudeConfigDir,
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: selections.claudeConfigDir,
		};
	}
	if (
		presetId === "codex" &&
		selections.codexHome &&
		existsSync(selections.codexHome)
	) {
		return {
			CODEX_HOME: selections.codexHome,
			SUPERSET_DEFAULT_CODEX_HOME: selections.codexHome,
		};
	}
	return {};
}
