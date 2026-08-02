/**
 * Claude Code's `/color` command accepts these named colors (see
 * packages/host-service/src/terminal-agents/claude-transcript.ts for where
 * the chosen name is read from). Maps each to a concrete CSS value for the
 * dot/swatch shown on tabs and the agent hover-list.
 */
export const CLAUDE_AGENT_COLOR_VALUES: Record<string, string> = {
	red: "#ef4444",
	blue: "#3b82f6",
	green: "#22c55e",
	yellow: "#eab308",
	purple: "#a855f7",
	orange: "#f97316",
	pink: "#ec4899",
	cyan: "#06b6d4",
};

export function resolveClaudeAgentColor(
	color: string | undefined,
): string | undefined {
	if (!color) return undefined;
	return CLAUDE_AGENT_COLOR_VALUES[color];
}

/** Low-alpha tint of a resolved agent color, for a background-decoration look. */
export function resolveClaudeAgentAccentBackground(
	color: string | undefined,
): string | undefined {
	const resolved = resolveClaudeAgentColor(color);
	if (!resolved) return undefined;
	return `color-mix(in srgb, ${resolved} 18%, transparent)`;
}
