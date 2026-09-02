import { join } from "node:path";
import type { SlashCommand } from "@superset/shared/slash-commands";
import { CODEX_BUILTIN_SLASH_COMMANDS } from "../builtins";
import { scanClaudeSlashCommands } from "../scan-claude";

export interface SlashCommandScanContext {
	/** Workspace worktree root (workspaces.worktreePath). */
	worktreePath: string;
	/** Effective provider config home (CLAUDE_CONFIG_DIR / CODEX_HOME / CLI default). */
	configDir: string;
}

export interface SlashCommandDiscoveryEntry {
	/** Terminal-agent presetId — same keying as AGENT_MODEL_SUPPORT. */
	presetId: string;
	/**
	 * Effective config home given the merged launch env (account default
	 * overlaid by the config's own env — the same precedence agents.run uses),
	 * falling back to the CLI's default under homeDir.
	 */
	resolveConfigDir(env: Record<string, string>, homeDir: string): string;
	scan(ctx: SlashCommandScanContext): Promise<SlashCommand[]>;
}

/**
 * Per-agent slash-command discovery. Like AGENT_MODEL_SUPPORT this is a
 * partial, opt-in table: an agent absent here has no discoverable command
 * vocabulary, its list is empty, and composers never show a menu for it.
 *
 * Codex serves only its builtin table. Verified against codex-cli 0.149
 * (2026-08-24): custom prompts no longer exist — the `/` popup lists only
 * builtins and both repo `.codex/prompts` and `$CODEX_HOME/prompts` files
 * answer "Unrecognized command" — and `$`-invoked skills are excluded because
 * a pasted `$skill` opens the insert popup, which consumes the submitting
 * Enter, so a composer send inserts without running. Builtins DO execute
 * through the paste-and-enter send path (`/status` verified live).
 */
export const SLASH_COMMAND_DISCOVERY: readonly SlashCommandDiscoveryEntry[] = [
	{
		presetId: "claude",
		resolveConfigDir: (env, homeDir) =>
			env.CLAUDE_CONFIG_DIR?.trim() || join(homeDir, ".claude"),
		scan: scanClaudeSlashCommands,
	},
	{
		presetId: "codex",
		resolveConfigDir: (env, homeDir) =>
			env.CODEX_HOME?.trim() || join(homeDir, ".codex"),
		scan: async () => [...CODEX_BUILTIN_SLASH_COMMANDS],
	},
];

export function getSlashCommandDiscovery(
	presetId: string,
): SlashCommandDiscoveryEntry | undefined {
	return SLASH_COMMAND_DISCOVERY.find((entry) => entry.presetId === presetId);
}
