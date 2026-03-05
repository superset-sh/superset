import type { Terminal } from "@xterm/xterm";

/**
 * Registers parser hooks to suppress terminal query responses from being displayed.
 *
 * These handlers intercept specific response-only sequences that should not appear
 * as visible text. We only suppress sequences where the response has a DIFFERENT
 * format than the query, ensuring we don't break terminal functionality.
 *
 * SAFE to suppress (response-only, query uses different format):
 * - CSI R: CPR response (query is CSI 6n)
 * - CSI I/O: Focus reports (no query, just mode enable)
 * - CSI $y: Mode report (query is CSI $p)
 *
 * NOT suppressed (would break queries/commands):
 * - CSI c: DA query AND response both end in 'c'
 * - CSI t: Window query AND response both end in 't'
 * - OSC colors: Set command AND response have same format
 *
 * @param terminal - The xterm.js Terminal instance
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
	// ghostty-web does not expose parser hooks; keep call-site compatible no-op cleanup.
	void terminal;
	return () => {};
}
