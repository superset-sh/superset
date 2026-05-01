/**
 * Returns true when the configured pane command launches OpenAI Codex.
 *
 * Used by useTerminalLifecycle to skip the Shift+Enter → ESC+CR override
 * (which Claude Code's TUI relies on) and let xterm's kitty keyboard
 * encoding deliver `\x1b[13;2u` to Codex's Ink TUI instead. See issue #3942.
 */
export function isCodexCommand(command: string | undefined): boolean {
	if (!command) return false;
	// Match the binary name as a whole word so commands referencing files
	// like "codex.md" or "codex-history" don't trip the check.
	return /(^|\/|\s)codex(\s|$)/.test(command);
}
