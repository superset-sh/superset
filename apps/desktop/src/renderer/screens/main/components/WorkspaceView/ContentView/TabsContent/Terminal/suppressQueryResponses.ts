import type { Terminal } from "@xterm/xterm";

export interface ShellIntegrationOptions {
	/** Called when shell is about to execute a command (OSC 133;B) */
	onCommandStart?: (command: string) => void;
	/** Called when command finishes with exit code (OSC 133;D) */
	onCommandFinish?: (exitCode: number) => void;
}

/**
 * Registers parser hooks to suppress terminal query responses from being displayed
 * and optionally capture OSC 133 shell integration events.
 *
 * When programs query terminal capabilities (DA1, DA2, CPR, etc.), the terminal
 * responds with escape sequences. These responses should be handled internally,
 * not displayed as visible text. xterm.js's parser hooks let us intercept and
 * suppress these sequences at the display layer.
 *
 * OSC 133 is a shell integration protocol (used by iTerm2, VS Code, etc.) that
 * lets the shell communicate semantic information about commands:
 * - OSC 133;A - Prompt start
 * - OSC 133;B - Command start (prompt end)
 * - OSC 133;C - Command executed
 * - OSC 133;D;exitCode - Command finished
 *
 * @param terminal - The xterm.js Terminal instance
 * @param options - Optional callbacks for shell integration events
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(
	terminal: Terminal,
	options: ShellIntegrationOptions = {},
): () => void {
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

	// OSC 133 - Shell integration (iTerm2/VS Code protocol)
	// Captures semantic shell events without suppressing display
	disposables.push(
		parser.registerOscHandler(133, (data: string) => {
			const [param, ...rest] = data.split(";");

			if (param === "B" && options.onCommandStart) {
				// Command start - rest may contain the command text
				options.onCommandStart(rest.join(";"));
			} else if (param === "D" && options.onCommandFinish) {
				// Command finished - rest[0] is exit code
				const exitCode = Number.parseInt(rest[0] || "0", 10);
				options.onCommandFinish(exitCode);
			}

			return false; // Don't suppress - let terminal display normally
		}),
	);

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
