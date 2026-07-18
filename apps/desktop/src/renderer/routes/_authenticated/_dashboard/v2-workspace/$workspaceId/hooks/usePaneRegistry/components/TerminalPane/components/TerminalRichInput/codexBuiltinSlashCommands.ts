import type { SlashCommand } from "renderer/components/Chat/ChatInterface/hooks/useSlashCommands";

function builtin(
	name: string,
	description: string,
	argumentHint = "",
): SlashCommand {
	return {
		name,
		aliases: [],
		description,
		argumentHint,
		kind: "builtin",
		source: "builtin",
	};
}

/**
 * Codex CLI's own built-in slash commands, surfaced in the terminal rich
 * input's "/" menu when Codex is the detected agent. Curated against Codex
 * 0.144.5: the CLI has no machine-readable command listing, and
 * session-control commands that only make sense typed interactively (exit,
 * copy, raw, side, name, archive, agent, hooks) are deliberately omitted.
 * The CLI resolves and executes these itself, so an outdated entry degrades
 * to Codex printing its own "unknown command" message. Note: submission must
 * be typed, not pasted — Codex treats a bracket-pasted "/command" as plain
 * chat text (see typeCommandIntoPty).
 *
 * Codex custom prompts (/prompts:*) also exist, but there is no discovery
 * wiring for them yet — this list is builtins only.
 */
export const CODEX_BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
	builtin("clear", "Clear conversation history"),
	builtin(
		"compact",
		"Summarize conversation to prevent hitting the context limit",
	),
	builtin("diff", "Show git diff"),
	builtin("fast", "Switch to the fast model for quick tasks"),
	builtin("fork", "Branch off the current conversation"),
	builtin("init", "Create an AGENTS.md file for this project"),
	builtin("mcp", "List configured MCP servers and tools"),
	builtin("memories", "View and edit memories"),
	builtin("mention", "Mention a file"),
	builtin("model", "Choose model and reasoning effort"),
	builtin("new", "Start a new chat"),
	builtin("permissions", "Choose what Codex is allowed to do"),
	builtin("plan", "Switch to Plan mode", "prompt"),
	builtin("resume", "Resume a saved conversation"),
	builtin("review", "Review current changes and find issues"),
	builtin("skills", "List available skills"),
	builtin("status", "Show session configuration and token usage"),
	builtin("usage", "View account usage"),
];
