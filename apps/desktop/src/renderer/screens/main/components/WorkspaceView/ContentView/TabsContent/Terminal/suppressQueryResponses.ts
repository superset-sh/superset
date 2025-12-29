import type { Terminal } from "@xterm/xterm";

/**
 * Registers parser hooks to suppress terminal query responses from being displayed.
 *
 * When programs query terminal capabilities (DA1, DA2, CPR, etc.), the terminal
 * responds with escape sequences. These responses should be handled internally,
 * not displayed as visible text. xterm.js's parser hooks let us intercept and
 * suppress these sequences at the display layer.
 *
 * @param terminal - The xterm.js Terminal instance
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
	const disposables: { dispose: () => void }[] = [];
	const parser = terminal.parser;

	// CSI sequences ending in 'R' - Cursor Position Report
	// CPR: ESC[24;1R (row;column)
	disposables.push(parser.registerCsiHandler({ final: "R" }, () => true));

	// CSI sequences ending in 'y' with '$' intermediate - Mode Reports
	// DECRPM: ESC[?1;2$y (private mode report)
	// Standard mode report: ESC[12;2$y
	disposables.push(
		parser.registerCsiHandler({ intermediates: "$", final: "y" }, () => {
			return true; // Suppress - don't display
		}),
	);

	// DA2 responses can leak into output when tty echo state is wrong.
	// If we process them, xterm's built-in DA2 request handler will treat them as a request
	// and emit another DA2 response, potentially causing a feedback loop.
	//
	// IMPORTANT: Allow real DA2 *requests* (ESC[>c, ESC[>0c) through so programs can query.
	disposables.push(
		parser.registerCsiHandler({ prefix: ">", final: "c" }, (params) => {
			const flatParams = params.flatMap((p) => (Array.isArray(p) ? p : [p]));
			// Responses are "CSI > Pp ; Pv ; Pc c" (2+ params). Requests are 0/1 param.
			return flatParams.length > 1;
		}),
	);

	// CSI < ... (M|m) - SGR mouse tracking reports
	// These are terminal-to-host input reports that can leak into PTY output and should never display.
	disposables.push(
		parser.registerCsiHandler({ prefix: "<", final: "M" }, () => true),
	);
	disposables.push(
		parser.registerCsiHandler({ prefix: "<", final: "m" }, () => true),
	);

	// OSC 10-19 - Color query responses
	// OSC 10: foreground color (ESC]10;rgb:ffff/ffff/ffff BEL)
	// OSC 11: background color
	// OSC 12: cursor color
	// etc.
	for (let i = 10; i <= 19; i++) {
		disposables.push(
			parser.registerOscHandler(i, (data) => {
				const slots = data.split(";").map((s) => s.trim());

				// Allow queries (slots contain "?") so programs can get the response.
				if (slots.some((s) => s === "?")) {
					return false;
				}

				// Suppress xterm-style rgb:* responses that can leak into output and mutate colors.
				// Still allow other set formats (e.g. #RRGGBB).
				if (slots.some((s) => s.startsWith("rgb:"))) {
					return true;
				}

				return false;
			}),
		);
	}

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
