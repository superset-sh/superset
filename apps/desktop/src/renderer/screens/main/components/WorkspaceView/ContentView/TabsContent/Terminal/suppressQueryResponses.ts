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
 *
 * OSC color queries (10-19) are selectively suppressed: only the query form
 * (data === "?") is consumed to prevent xterm.js from generating a response
 * that leaks into the PTY input buffer. Set commands (data contains a color
 * value) pass through normally. Superset provides COLORFGBG in the terminal
 * environment as the preferred dark/light mode detection mechanism.
 *
 * @param terminal - The xterm.js Terminal instance
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
	const disposables: { dispose: () => void }[] = [];
	const parser = terminal.parser;

	// CSI sequences ending in 'R' - Cursor Position Report (SAFE)
	// Query: ESC[6n (ends in 'n'), Response: ESC[24;1R (ends in 'R')
	// Different final bytes, so suppressing 'R' only catches responses
	disposables.push(parser.registerCsiHandler({ final: "R" }, () => true));

	// CSI sequences ending in 'I' - Focus In report (SAFE)
	// No query - this is sent when terminal gains focus (mode 1004)
	disposables.push(parser.registerCsiHandler({ final: "I" }, () => true));

	// CSI sequences ending in 'O' - Focus Out report (SAFE)
	// No query - this is sent when terminal loses focus (mode 1004)
	disposables.push(parser.registerCsiHandler({ final: "O" }, () => true));

	// CSI sequences ending in 'y' with '$' intermediate - Mode Reports (SAFE)
	// Query: ESC[?Ps$p (ends in 'p'), Response: ESC[?Ps;Pm$y (ends in 'y')
	// Different final bytes, so suppressing '$y' only catches responses
	disposables.push(
		parser.registerCsiHandler({ intermediates: "$", final: "y" }, () => true),
	);

	// OSC 10-19: Color query/set sequences
	// Query form: ESC]10;?ST  — asks terminal for current color, generates a
	//   response (e.g. ESC]10;rgb:eaea/e8e8/e6e6ST) written to PTY input.
	//   CLI tools like oh-my-posh and reedline trigger these for dark/light
	//   detection; the responses leak into apps reading stdin (e.g. Forge).
	// Set form:   ESC]10;rgb:...ST — sets the color, no response generated.
	//
	// We suppress only the query ("?") so set commands still work.
	// OSC 10 = foreground, 11 = background, 12 = cursor, 13-19 = other colors.
	for (let osc = 10; osc <= 19; osc++) {
		disposables.push(parser.registerOscHandler(osc, (data) => data === "?"));
	}

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
