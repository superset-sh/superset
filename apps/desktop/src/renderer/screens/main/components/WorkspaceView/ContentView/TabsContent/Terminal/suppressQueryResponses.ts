import type { Terminal } from "@xterm/xterm";

/**
 * Registers parser hooks to suppress terminal query responses and control sequences
 * from being displayed as visible text.
 *
 * When programs query terminal capabilities or send control sequences, the terminal
 * may respond with escape sequences. These responses should be handled internally,
 * not displayed as visible text. xterm.js's parser hooks let us intercept and
 * suppress these sequences at the display layer, similar to how iTerm2 and Hyper
 * handle escape sequences.
 *
 * This prevents escape sequences from "leaking" into the terminal output, which
 * is especially important for TUI applications that rely on precise terminal state.
 *
 * @param terminal - The xterm.js Terminal instance
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
	const disposables: { dispose: () => void }[] = [];
	const parser = terminal.parser;

	// ============================================================================
	// CSI (Control Sequence Introducer) Sequences
	// ============================================================================

	// CSI sequences ending in 'c' - Device Attributes responses
	// DA1: ESC[?1;2c (primary device attributes)
	// DA2: ESC[>0;276;0c (secondary device attributes)
	// Also handles ESC[0;276;0c (without ? or > prefix)
	disposables.push(parser.registerCsiHandler({ final: "c" }, () => true));

	// CSI sequences ending in 'R' - Cursor Position Report
	// CPR: ESC[24;1R (row;column)
	// Used by programs to query cursor position
	disposables.push(parser.registerCsiHandler({ final: "R" }, () => true));

	// CSI sequences ending in 'y' with '$' intermediate - Mode Reports
	// DECRPM: ESC[?1;2$y (private mode report)
	// Standard mode report: ESC[12;2$y
	disposables.push(
		parser.registerCsiHandler({ intermediates: "$", final: "y" }, () => {
			return true; // Suppress - don't display
		}),
	);

	// CSI sequences ending in 'n' - Device Status Reports (DSR)
	// DSR 5: ESC[0n (device status OK)
	// DSR 6: ESC[n;mR (cursor position report - already handled above)
	// DSR 7: ESC[?15n (printer ready)
	// These are responses to queries and shouldn't be displayed
	// Note: We need to be careful - some DSR sequences are control sequences, not queries
	// But query responses (like ESC[0n) should be suppressed
	disposables.push(parser.registerCsiHandler({ final: "n" }, () => true));

	// CSI sequences with '?' prefix ending in 'n' - DEC Private Mode Status Reports
	// DECDSR: ESC[?6n (cursor position report)
	// ESC[?15n (printer ready)
	// ESC[?25n (cursor visible)
	// ESC[?26n (cursor key mode)
	// All DEC private mode reports are query responses
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "n" }, () => true),
	);

	// CSI sequences ending in 'q' - Terminal ID and Capability Queries
	// DECRQSS: ESC[?q - Request Status String (query)
	// ESC[>0q - Terminal ID query response
	// ESC[>1q - Terminal ID query response
	// ESC[>c - Secondary device attributes (already handled above)
	// All 'q' sequences are query responses
	disposables.push(parser.registerCsiHandler({ final: "q" }, () => true));

	// CSI sequences with '>' prefix ending in 'q' - Terminal ID responses
	// ESC[>0;276;0q - Terminal ID response
	// These are always query responses
	disposables.push(
		parser.registerCsiHandler({ prefix: ">", final: "q" }, () => true),
	);

	// CSI sequences with '?' prefix ending in 'q' - DEC Request Status String
	// DECRQSS: ESC[?q - Request Status String (query response)
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "q" }, () => true),
	);

	// CSI sequences ending in 'x' - Request Terminal Parameters
	// DECREQTPARM: ESC[?x (request terminal parameters)
	// Response sequences shouldn't be displayed
	// Note: ESC[x is also used for some control functions, but query responses
	// typically come from the terminal, not the application
	disposables.push(parser.registerCsiHandler({ final: "x" }, () => true));

	// CSI sequences with '?' prefix ending in 'x' - DEC Request Terminal Parameters
	// DECREQTPARM: ESC[?x - Request Terminal Parameters (query response)
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "x" }, () => true),
	);

	// CSI sequences ending in 't' - Window manipulation
	// Some are queries (ESC[13t, ESC[14t, etc.) but many are control sequences
	// (ESC[3;x;yt to move window, ESC[22t to save title, etc.)
	// We can't easily distinguish query responses from control sequences
	// Query responses are rare and xterm.js handles window manipulation internally
	// So we don't suppress 't' sequences to avoid breaking legitimate functionality

	// ============================================================================
	// OSC (Operating System Command) Sequences
	// ============================================================================

	// OSC 10-19 - Color query responses
	// OSC 10: foreground color (ESC]10;rgb:ffff/ffff/ffff BEL)
	// OSC 11: background color
	// OSC 12: cursor color
	// OSC 13: mouse foreground color
	// OSC 14: mouse background color
	// OSC 15: Tektronix foreground color
	// OSC 16: Tektronix background color
	// OSC 17: highlight background color
	// OSC 18: Tektronix cursor color
	// OSC 19: highlight foreground color
	// When queried with "?", these return color values that shouldn't be displayed
	for (let i = 10; i <= 19; i++) {
		disposables.push(
			parser.registerOscHandler(i, () => {
				return true; // Suppress - don't display
			}),
		);
	}

	// OSC 4 - Color palette
	// ESC]4;c;? ST - Query color palette (query)
	// ESC]4;c;rgb:rrrr/gggg/bbbb ST - Set color (control sequence)
	// Query responses come back as ESC]4;c;rgb:... ST
	// We can't easily distinguish responses from sets, so we don't suppress OSC 4
	// Applications should handle color palette queries correctly

	// OSC 52 - Clipboard manipulation (selection/paste)
	// ESC]52;c;BASE64 ST - Set clipboard
	// ESC]52;c;? ST - Query clipboard (query)
	// Query responses come back as ESC]52;c;BASE64 ST
	// We can't easily distinguish responses from sets, so we don't suppress OSC 52
	// Note: xterm.js handles OSC 52 internally, and clipboard queries are rare
	// If clipboard data leaks, it's a security issue but not a display issue

	// OSC 1048-1049 - Save/Restore cursor (iTerm2 extensions)
	// These are control sequences, not queries, but some implementations
	// may send responses that shouldn't be displayed
	// We don't suppress these as they're control sequences, not query responses

	// OSC 1337 - iTerm2 proprietary sequences
	// ESC]1337;... ST - Various iTerm2-specific commands
	// We don't suppress these as they may contain actual content,
	// but query responses within this range should be handled
	// Note: iTerm2 sequences are typically one-way (app -> terminal),
	// so they shouldn't leak back into output

	// ============================================================================
	// ESC (Escape) Sequences
	// ============================================================================

	// ESC sequences ending in 'c' - Full Reset / Identify Device
	// ESC c - Full reset (RIS)
	// This is a control sequence, not a query response, so we don't suppress it
	// But some terminals may send identification sequences that should be suppressed

	// ============================================================================
	// Additional TUI-friendly suppressions
	// ============================================================================

	// Some programs send malformed or incomplete escape sequences that can
	// leak into output. While we can't catch all of them, the above handlers
	// cover the most common cases that cause issues with TUI applications.

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
