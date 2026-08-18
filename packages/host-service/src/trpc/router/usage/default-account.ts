/**
 * Host-wide default provider account for newly launched agents. "Switching"
 * an account never touches credential stores — it only records which profile
 * dir to inject (CLAUDE_CONFIG_DIR / CODEX_HOME) when an agent starts, so the
 * provider CLI itself keeps owning every login end to end.
 */

import { existsSync } from "node:fs";
import type { HostDb } from "../../../db";
import { hostSettings } from "../../../db/schema";
import type { UsageProvider } from "./types";

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
}

/**
 * Env for a new terminal so provider CLIs typed or launched in it run on the
 * host-default accounts. Both providers' vars — a shell can run either CLI.
 * Baked at PTY spawn; existing terminals keep the account they started with.
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
		return { CLAUDE_CONFIG_DIR: selections.claudeConfigDir };
	}
	if (
		presetId === "codex" &&
		selections.codexHome &&
		existsSync(selections.codexHome)
	) {
		return { CODEX_HOME: selections.codexHome };
	}
	return {};
}
