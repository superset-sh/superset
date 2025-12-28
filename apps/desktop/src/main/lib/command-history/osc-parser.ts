/**
 * OSC 133 Shell Integration Sequence Parser
 *
 * Parses OSC 133 sequences emitted by shell hooks to extract command information.
 *
 * Sequence format:
 * - OSC 133;C;{command} ST - Command start (preexec)
 * - OSC 133;D;{exit_code} ST - Command done (precmd)
 *
 * Where:
 * - OSC = \x1b] (ESC ])
 * - ST = \x1b\\ (ESC \) or \x07 (BEL)
 */

export interface OscCommandStart {
	type: "command_start";
	command: string;
}

export interface OscCommandDone {
	type: "command_done";
	exitCode: number;
}

export type OscEvent = OscCommandStart | OscCommandDone;

// Regex to match OSC 133 sequences
// Matches: \x1b]133;C;{command}\x1b\\ or \x1b]133;C;{command}\x07
// And: \x1b]133;D;{exit_code}\x1b\\ or \x1b]133;D;{exit_code}\x07
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - parsing escape sequences
const OSC_133_REGEX = /\x1b\]133;([CD]);([^\x07\x1b]*?)(?:\x1b\\|\x07)/g;

/**
 * Parse OSC 133 sequences from terminal data
 * Returns extracted events and data with sequences stripped
 */
export function parseOscSequences(data: string): {
	events: OscEvent[];
	cleanData: string;
} {
	const events: OscEvent[] = [];
	let cleanData = data;

	// Find all matches using matchAll
	const regex = new RegExp(OSC_133_REGEX.source, "g");
	for (const match of data.matchAll(regex)) {
		const [, type, payload] = match;

		if (type === "C") {
			// Command start
			events.push({
				type: "command_start",
				command: payload,
			});
		} else if (type === "D") {
			// Command done
			const exitCode = Number.parseInt(payload, 10);
			events.push({
				type: "command_done",
				exitCode: Number.isNaN(exitCode) ? 0 : exitCode,
			});
		}
	}

	// Strip OSC sequences from data
	cleanData = data.replace(OSC_133_REGEX, "");

	return { events, cleanData };
}

/**
 * State machine for tracking command execution
 * Correlates command start and done events
 */
export class CommandTracker {
	private pendingCommand: string | null = null;
	private onCommand: (command: string, exitCode: number) => void;

	constructor(onCommand: (command: string, exitCode: number) => void) {
		this.onCommand = onCommand;
	}

	/**
	 * Process an OSC event
	 */
	processEvent(event: OscEvent): void {
		if (event.type === "command_start") {
			// Store the command for when we get the done event
			this.pendingCommand = event.command;
		} else if (event.type === "command_done") {
			// Emit the completed command
			if (this.pendingCommand) {
				this.onCommand(this.pendingCommand, event.exitCode);
				this.pendingCommand = null;
			}
		}
	}

	/**
	 * Get the current pending command (if any)
	 */
	getPendingCommand(): string | null {
		return this.pendingCommand;
	}

	/**
	 * Clear the pending command
	 */
	clear(): void {
		this.pendingCommand = null;
	}
}
