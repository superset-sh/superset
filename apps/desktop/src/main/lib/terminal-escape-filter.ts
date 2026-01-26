/**
 * Utilities for detecting terminal clear scrollback sequences.
 */

const ESC = "\x1b";
const ED3_SEQUENCE = `${ESC}[3J`;

/**
 * Pattern to detect clear scrollback sequences (ED3 only).
 * ESC c (RIS) is intentionally excluded - TUI apps use it for repaints.
 */
const CLEAR_SCROLLBACK_PATTERN = new RegExp(`${ESC}\\[3J`);

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
