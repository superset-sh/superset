/**
 * Sanitization applied ONLY when restoring historical scrollback into a fresh xterm.js instance.
 *
 * IMPORTANT: Do NOT use this for live PTY output. Programs rely on many control sequences
 * (alt-screen, application cursor keys, bracketed paste, etc.) to function correctly.
 *
 * The goal here is to prevent restored scrollback from mutating xterm's runtime mode state
 * before the live session redraws, which can desync input/modes for TUIs.
 */

const ESC = "\x1b";

// ESC c (RIS) - full reset (can clear buffers / mutate state)
const RIS = new RegExp(`${ESC}c`, "g");

// CSI ! p (DECSTR) - soft reset
const DECSTR = new RegExp(`${ESC}\\[!p`, "g");

// Mode toggles that are stateful but not meaningful for historical scrollback.
// Examples: alternate screen, application cursor keys, mouse tracking, bracketed paste, focus reporting, cursor visibility.
const STATEFUL_PRIVATE_MODES = new RegExp(
	`${ESC}\\[\\?(?:1|7|25|47|1047|1049|1000|1002|1003|1005|1006|2004|1004)[hl]`,
	"g",
);

// Scroll region changes (DECSTBM). These affect scrolling behavior without adding display content.
const SCROLL_REGION = new RegExp(`${ESC}\\[(?:\\d{1,3}(?:;\\d{1,3})?)?r`, "g");

export function sanitizeRestoredScrollback(data: string): string {
	if (!data) return data;

	return data
		.replace(RIS, "")
		.replace(DECSTR, "")
		.replace(STATEFUL_PRIVATE_MODES, "")
		.replace(SCROLL_REGION, "");
}
