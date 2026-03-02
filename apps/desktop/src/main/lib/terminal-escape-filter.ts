/**
 * Utilities for detecting terminal clear scrollback sequences.
 */

const ESC = "\x1b";

/**
 * Pattern to detect clear scrollback sequences:
 * - ESC [ 3 J - Clear scrollback buffer (ED3)
 *
 * Note: We intentionally do NOT include ESC c (RIS - Reset to Initial State)
 * because TUI applications (vim, htop, etc.) commonly use RIS for screen
 * repaints/refreshes. Only ED3 is a deliberate "clear scrollback" action
 * triggered by commands like `clear` or Cmd+K.
 */
const CLEAR_SCROLLBACK_PATTERN = new RegExp(`${ESC}\\[3J`);

const ED3_SEQUENCE = `${ESC}[3J`;

/**
 * Checks if data contains sequences that clear the scrollback buffer.
 * Used to detect when the shell sends clear commands (e.g., from `clear` command or Cmd+K).
 *
 * Detected sequences:
 * - ESC [ 3 J - Clear scrollback buffer (ED3)
 *
 * Note: ESC c (RIS) is intentionally not detected as TUI apps use it for repaints.
 */
export function containsClearScrollbackSequence(data: string): boolean {
	return CLEAR_SCROLLBACK_PATTERN.test(data);
}

/**
 * Extracts content after the last clear scrollback sequence.
 * When a clear sequence is detected, only the content AFTER the last
 * clear sequence should be persisted to scrollback/history.
 */
export function extractContentAfterClear(data: string): string {
	const ed3Index = data.lastIndexOf(ED3_SEQUENCE);

	if (ed3Index === -1) {
		return data;
	}

	return data.slice(ed3Index + ED3_SEQUENCE.length);
}
