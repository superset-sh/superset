import type { Terminal as XTerm } from "@xterm/xterm";
import stripAnsi from "strip-ansi";

const MAX_TITLE_LENGTH = 32;

export function sanitizeForTitle(text: string): string | null {
	const cleaned = stripAnsi(text).trim().slice(0, MAX_TITLE_LENGTH);

	return cleaned || null;
}

/**
 * Checks whether the characters in `command` were echoed back by the PTY onto
 * the current terminal line.
 *
 * When the PTY has echo enabled (normal input mode), every character the user
 * types is written back to the terminal screen.  When echo is disabled (e.g.
 * during a `sudo` password prompt), the terminal line shows only the password
 * prompt text ("Password: ") and none of the typed characters.
 *
 * By verifying that the accumulated keystroke buffer actually appears in the
 * visible terminal line we can avoid leaking secret input into the tab title.
 *
 * Returns `false` (treat as no-echo / unsafe) when:
 *  - `command` is empty
 *  - the xterm buffer line cannot be read
 *  - the typed characters are not found in the current terminal line
 */
export function isCommandEchoed(xterm: XTerm, command: string): boolean {
	if (!command) return false;

	const active = xterm.buffer.active;
	const lineIndex = active.cursorY + active.viewportY;
	const line = active.getLine(lineIndex)?.translateToString(true) ?? "";

	return line.includes(command);
}
