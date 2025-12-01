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

	// CSI sequences ending in 'c' - Device Attributes responses
	// DA1: ESC[?1;2c (primary device attributes)
	// DA2: ESC[>0;276;0c (secondary device attributes)
	// Also handles ESC[0;276;0c (without ? or > prefix)
	disposables.push(parser.registerCsiHandler({ final: "c" }, () => true));

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

	// OSC 10-19 - Color query responses
	// OSC 10: foreground color (ESC]10;rgb:ffff/ffff/ffff BEL)
	// OSC 11: background color
	// OSC 12: cursor color
	// etc.
	for (let i = 10; i <= 19; i++) {
		disposables.push(
			parser.registerOscHandler(i, () => {
				return true; // Suppress - don't display
			}),
		);
	}

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
