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
 * Claude Code's own built-in slash commands, surfaced in the terminal rich
 * input's "/" menu alongside discovered commands and skills. Curated: the CLI
 * has no machine-readable command listing, and these names are stable across
 * releases (documented at code.claude.com/docs/en/commands). Session-control
 * commands that only make sense typed interactively (login, exit, vim) are
 * deliberately omitted. The CLI resolves and executes these itself — the menu
 * is discovery + autocomplete only, so an outdated entry degrades to Claude
 * Code printing its own "unknown command" message.
 */
export const CLAUDE_CODE_BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
	builtin("clear", "Clear conversation history"),
	builtin(
		"compact",
		"Compact the conversation, optionally with focus instructions",
		"instructions",
	),
	builtin("config", "Open the settings panel"),
	builtin("context", "Show context window usage"),
	builtin("cost", "Show token usage and cost for this session"),
	builtin("doctor", "Check the health of the Claude Code installation"),
	builtin(
		"effort",
		"Set reasoning effort",
		"low | medium | high | xhigh | max",
	),
	builtin("export", "Export the conversation"),
	builtin("help", "Show available commands and usage"),
	builtin("init", "Initialize a CLAUDE.md for this project"),
	builtin("mcp", "Manage MCP server connections"),
	builtin("memory", "Edit memory files"),
	builtin("model", "Switch the model", "model"),
	builtin("permissions", "View or update tool permissions"),
	builtin("resume", "Resume a previous session"),
	builtin("review", "Review a pull request", "pr"),
	builtin("rewind", "Rewind the conversation or code"),
	builtin("status", "Show version, model, and connectivity"),
	builtin("todos", "List current todo items"),
	builtin("usage", "Show plan usage limits"),
];
