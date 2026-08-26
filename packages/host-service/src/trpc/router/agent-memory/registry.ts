import { join } from "node:path";

export interface AgentMemoryFileDefinition {
	/** Terminal-agent presetId — same keying as SLASH_COMMAND_DISCOVERY. */
	presetId: string;
	/** Global memory file name inside the config dir, as the agent's docs name it. */
	fileName: string;
	/** Instruction file the agent reads at a project's repo root. */
	projectFileName: string;
	/**
	 * Effective config home given the merged launch env (account default
	 * overlaid by the config's own env — the same precedence agents.run uses),
	 * falling back to the CLI's default under homeDir.
	 */
	resolveConfigDir(env: Record<string, string>, homeDir: string): string;
	/**
	 * Per-project auto-memory directory (Claude Code's
	 * `<configDir>/projects/<sanitized-repo-path>/memory`). Absent for agents
	 * without one.
	 */
	resolveAutoMemoryDir?(
		env: Record<string, string>,
		homeDir: string,
		repoPath: string,
	): string;
}

/**
 * Claude Code's project-dir slug: the absolute path with every character
 * outside [A-Za-z0-9-] replaced by "-" ("/Users/k/.superset/x" →
 * "-Users-k--superset-x"). Verified against real ~/.claude/projects dirs.
 */
export function sanitizeClaudeProjectDir(repoPath: string): string {
	return repoPath.replace(/[^A-Za-z0-9-]/g, "-");
}

/**
 * Per-agent global memory/instruction files. Like SLASH_COMMAND_DISCOVERY
 * this is a partial, opt-in table: an agent absent here has no known memory
 * files and doesn't appear in the Memory tab.
 */
export const AGENT_MEMORY_FILES: readonly AgentMemoryFileDefinition[] = [
	{
		presetId: "claude",
		fileName: "CLAUDE.md",
		projectFileName: "CLAUDE.md",
		resolveConfigDir: (env, homeDir) =>
			env.CLAUDE_CONFIG_DIR?.trim() || join(homeDir, ".claude"),
		resolveAutoMemoryDir(env, homeDir, repoPath) {
			return join(
				this.resolveConfigDir(env, homeDir),
				"projects",
				sanitizeClaudeProjectDir(repoPath),
				"memory",
			);
		},
	},
	{
		presetId: "codex",
		fileName: "AGENTS.md",
		projectFileName: "AGENTS.md",
		resolveConfigDir: (env, homeDir) =>
			env.CODEX_HOME?.trim() || join(homeDir, ".codex"),
	},
	{
		presetId: "gemini",
		fileName: "GEMINI.md",
		projectFileName: "GEMINI.md",
		resolveConfigDir: (_env, homeDir) => join(homeDir, ".gemini"),
	},
	{
		presetId: "opencode",
		fileName: "AGENTS.md",
		projectFileName: "AGENTS.md",
		resolveConfigDir: (env, homeDir) =>
			join(env.XDG_CONFIG_HOME?.trim() || join(homeDir, ".config"), "opencode"),
	},
];

export function getAgentMemoryFile(
	presetId: string,
): AgentMemoryFileDefinition | undefined {
	return AGENT_MEMORY_FILES.find((entry) => entry.presetId === presetId);
}
