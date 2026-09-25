import type { SlashCommand } from "@superset/shared/slash-commands";

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
		entryKind: "command",
		trigger: "/",
	};
}

/**
 * Claude Code's built-in commands, the long-stable core rather than the full
 * per-version set — the CLI adds commands faster than a static table can
 * follow, and an entry an older CLI lacks costs one "Unknown command" line in
 * the terminal. Hand-maintained the way AGENT_MODEL_SUPPORT is.
 */
export const CLAUDE_BUILTIN_SLASH_COMMANDS: readonly SlashCommand[] = [
	builtin("add-dir", "Add a new working directory", "<path>"),
	builtin("agents", "Manage agent configurations"),
	builtin("clear", "Start a new session with empty context"),
	builtin(
		"compact",
		"Compact the conversation to free context",
		"[instructions]",
	),
	builtin("config", "Open the settings panel"),
	builtin("context", "Visualize current context usage"),
	builtin("cost", "Show session cost and duration"),
	builtin("doctor", "Diagnose and verify the installation"),
	builtin("exit", "Exit the session"),
	builtin("export", "Export the conversation"),
	builtin("help", "Show help and available commands"),
	builtin("hooks", "Manage hook configurations"),
	builtin("init", "Initialize a CLAUDE.md for this repo"),
	builtin("mcp", "Manage MCP servers"),
	builtin("memory", "Edit memory files"),
	builtin("model", "Change the model for this session", "[model]"),
	builtin("permissions", "Manage tool permissions"),
	builtin("resume", "Resume a previous conversation", "[session]"),
	builtin("review", "Review changes for bugs and issues", "[scope]"),
	builtin("rewind", "Rewind the conversation or code"),
	builtin("status", "Show session status and account info"),
	builtin("statusline", "Configure the status line"),
	builtin("todos", "List current todo items"),
	builtin("usage", "Show plan usage limits"),
	builtin("vim", "Toggle vim editing mode"),
];

/**
 * Codex's built-in commands. Enumerated live against codex-cli 0.149.1
 * (2026-08-24) — the CLI's own `/` popup, verified name-by-name; `/status`
 * confirmed to execute through the composer's paste-and-enter send path.
 * Codex has no custom-command vocabulary to scan (its docs document only
 * builtins), so this table IS its discovery. Deliberately absent: `/ide` and
 * `/keymap` (pair a desktop editor and remap TUI keys — meaningless from the
 * phone), `/logout` (a stray tap deauthenticates the host's codex), and
 * `/title` (terminal-title config).
 */
export const CODEX_BUILTIN_SLASH_COMMANDS: readonly SlashCommand[] = [
	builtin("agents", "View and switch between all active agent sessions"),
	builtin("approve", "Approve one retry of a recent auto-review denial"),
	builtin("archive", "Archive this session and exit"),
	builtin("btw", "Start a side conversation in an ephemeral fork"),
	builtin("clear", "Clear the terminal and start a new chat"),
	builtin(
		"compact",
		"Summarize conversation to prevent hitting the context limit",
	),
	builtin("copy", "Copy last response as markdown"),
	builtin("delete", "Permanently delete this session and exit"),
	builtin("diff", "Show git diff (including untracked files)"),
	builtin("exit", "Exit Codex"),
	builtin("experimental", "Toggle experimental features"),
	builtin("fast", "1.5x speed, increased usage"),
	builtin("feedback", "Send logs to maintainers"),
	builtin("goal", "Set or view the goal for a long-running task", "[goal]"),
	builtin("hooks", "View and manage lifecycle hooks"),
	builtin("init", "Create an AGENTS.md file with instructions for Codex"),
	builtin("mcp", "List configured MCP tools", "[verbose]"),
	builtin("model", "Choose what model and reasoning effort to use"),
	builtin("new", "Start a new chat during a conversation", "[prompt]"),
	builtin("permissions", "Choose what Codex is allowed to do"),
	builtin("plan", "Switch to Plan mode"),
	builtin("plugins", "Browse plugins"),
	builtin("quit", "Exit Codex"),
	builtin("rename", "Rename the current thread", "[name]"),
	builtin("resume", "Resume a saved chat", "[thread]"),
	builtin("review", "Review current changes and find issues", "[instructions]"),
	builtin("skills", "Use skills to improve how Codex performs specific tasks"),
	builtin("status", "Show current session configuration and token usage"),
	builtin("statusline", "Configure which items appear in the status line"),
	builtin("subagents", "Switch between this session's subagents"),
	builtin("usage", "View account usage or use a usage limit reset", "[reset]"),
	builtin("vim", "Toggle Vim mode for the composer"),
];
