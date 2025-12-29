/**
 * Sanitize terminal scrollback before persisting/restoring.
 *
 * This module is shared between main and renderer processes.
 * Do NOT add any Node.js dependencies here.
 *
 * Why this exists:
 * - Some terminal "responses" (DA/DSR, mouse reports, etc.) can leak into the PTY output
 *   due to timing/tty echo state, and get captured into tmux/history scrollback.
 * - On restore, these show up as garbled text (e.g. `^[[>0;276;0c`).
 * - We strip only known non-display protocol artifacts while preserving styling (SGR, etc.).
 */

const ESC = "\x1b";

// Raw control sequence variants
// IMPORTANT: Do NOT match DA requests like ESC[c or ESC[>c, since xterm.js must see
// those in order to respond to programs querying terminal capabilities.
const DA1_RESPONSE_RAW = new RegExp(`${ESC}\\[\\?\\d[0-9;]*c`, "g");
const DA2_RESPONSE_RAW = new RegExp(`${ESC}\\[>\\d+(?:;\\d+)+c`, "g");
// Some terminals can lose the private prefix byte, leaving "ESC[0;276;0c".
const DA_RESPONSE_RAW_NO_PREFIX = new RegExp(`${ESC}\\[\\d+(?:;\\d+)+c`, "g");
const CPR_RESPONSE_RAW = new RegExp(`${ESC}\\[[?>]?[0-9;]*R`, "g");
const MODE_REPORT_RAW = new RegExp(`${ESC}\\[[?>]?[0-9;]*\\$y`, "g");
const MOUSE_SGR_RAW = new RegExp(`${ESC}\\[<\\d+(?:;\\d+){2}[Mm]`, "g");

// tty "echoctl" caret-escaped variants (ESC becomes "^[" so CSI becomes "^[[")
const DA1_RESPONSE_CARET = /\^\[\[\?\d[0-9;]*c/g;
const DA2_RESPONSE_CARET = /\^\[\[>\d+(?:;\d+)+c/g;
const DA_RESPONSE_CARET_NO_PREFIX = /\^\[\[\d+(?:;\d+)+c/g;
const CPR_RESPONSE_CARET = /\^\[\[[?>]?[0-9;]*R/g;
const MODE_REPORT_CARET = /\^\[\[[?>]?[0-9;]*\$y/g;
const MOUSE_SGR_CARET = /\^\[\[<\d+(?:;\d+){2}[Mm]/g;

// Heuristic cleanup for cases where only the payload leaks as text (seen with mouse reports).
// Require 2+ consecutive "Cb;Cx;CyM" segments to avoid eating legitimate output.
const MOUSE_SGR_PAYLOAD_RUN = /(?:\d{1,3};\d{1,3};\d{1,3}M){2,}/g;

// Heuristic cleanup for DA2 payload leakage (e.g. "0;276;0c") when the leading CSI is lost.
const DA_PAYLOAD = /(^|\s)[?>]?\d{1,4}(?:;\d{1,4}){1,4}c(?=$|\s)/g;

const PATTERNS: readonly RegExp[] = [
	DA1_RESPONSE_RAW,
	DA1_RESPONSE_CARET,
	DA2_RESPONSE_RAW,
	DA2_RESPONSE_CARET,
	DA_RESPONSE_RAW_NO_PREFIX,
	DA_RESPONSE_CARET_NO_PREFIX,
	CPR_RESPONSE_RAW,
	CPR_RESPONSE_CARET,
	MODE_REPORT_RAW,
	MODE_REPORT_CARET,
	MOUSE_SGR_RAW,
	MOUSE_SGR_CARET,
	MOUSE_SGR_PAYLOAD_RUN,
];

// Fast check for digit followed by response terminator (c, M)
const PAYLOAD_TERMINATOR_CHECK = /\d[cM]/;

export function sanitizeTerminalScrollback(data: string): string {
	if (!data) return data;

	const hasEsc = data.includes(ESC);
	const hasCaret = data.includes("^[");

	// Fast path: no escape sequences at all
	if (!hasEsc && !hasCaret) {
		// Only potential issue is payload leakage (digit followed by 'c' or 'M')
		// DA payload: ...0;276;0c   Mouse payload: ...32;10;20M
		if (!PAYLOAD_TERMINATOR_CHECK.test(data)) {
			return data;
		}
		// Only run payload cleanup patterns
		let sanitized = data;
		sanitized = sanitized.replace(MOUSE_SGR_PAYLOAD_RUN, "");
		sanitized = sanitized.replace(DA_PAYLOAD, "$1");
		return sanitized;
	}

	// Full sanitization path for data with escape sequences
	let sanitized = data;
	for (const pattern of PATTERNS) {
		sanitized = sanitized.replace(pattern, "");
	}

	// DA payload cleanup needs to preserve the leading whitespace capture.
	sanitized = sanitized.replace(DA_PAYLOAD, "$1");

	return sanitized;
}
