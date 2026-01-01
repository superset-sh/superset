/**
 * Headless Terminal Emulator
 *
 * Wraps @xterm/headless with:
 * - Mode tracking (DECSET/DECRST parsing)
 * - Snapshot generation via @xterm/addon-serialize
 * - Rehydration sequence generation for mode restoration
 */

import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/headless";
import {
	DEFAULT_MODES,
	type TerminalModes,
	type TerminalSnapshot,
} from "./types";

// =============================================================================
// Mode Tracking Constants
// =============================================================================

// Escape character
const ESC = "\x1b";
const BEL = "\x07";

const DEBUG_EMULATOR_TIMING =
	process.env.SUPERSET_TERMINAL_EMULATOR_DEBUG === "1";

/**
 * DECSET/DECRST mode numbers we track
 */
const MODE_MAP: Record<number, keyof TerminalModes> = {
	1: "applicationCursorKeys",
	6: "originMode",
	7: "autoWrap",
	9: "mouseTrackingX10",
	25: "cursorVisible",
	47: "alternateScreen", // Legacy alternate screen
	1000: "mouseTrackingNormal",
	1001: "mouseTrackingHighlight",
	1002: "mouseTrackingButtonEvent",
	1003: "mouseTrackingAnyEvent",
	1004: "focusReporting",
	1005: "mouseUtf8",
	1006: "mouseSgr",
	1049: "alternateScreen", // Modern alternate screen with save/restore
	2004: "bracketedPaste",
};

// =============================================================================
// Headless Emulator Class
// =============================================================================

export interface HeadlessEmulatorOptions {
	cols?: number;
	rows?: number;
	scrollback?: number;
}

export class HeadlessEmulator {
	private terminal: Terminal;
	private serializeAddon: SerializeAddon;
	private modes: TerminalModes;
	private cwd: string | null = null;
	private disposed = false;

	// Pending output buffer for query responses
	private pendingOutput: string[] = [];
	private onDataCallback?: (data: string) => void;

	// Buffer for partial escape sequences that span chunk boundaries
	private escapeSequenceBuffer = "";

	// Maximum buffer size to prevent unbounded growth (safety cap)
	private static readonly MAX_ESCAPE_BUFFER_SIZE = 1024;

	constructor(options: HeadlessEmulatorOptions = {}) {
		const { cols = 80, rows = 24, scrollback = 10000 } = options;

		this.terminal = new Terminal({
			cols,
			rows,
			scrollback,
			allowProposedApi: true,
		});

		this.serializeAddon = new SerializeAddon();
		this.terminal.loadAddon(this.serializeAddon);

		// Initialize mode state
		this.modes = { ...DEFAULT_MODES };

		// Listen for terminal output (query responses)
		this.terminal.onData((data) => {
			this.pendingOutput.push(data);
			this.onDataCallback?.(data);
		});
	}

	/**
	 * Set callback for terminal-generated output (query responses)
	 */
	onData(callback: (data: string) => void): void {
		this.onDataCallback = callback;
	}

	/**
	 * Get and clear pending output (query responses)
	 */
	flushPendingOutput(): string[] {
		const output = this.pendingOutput;
		this.pendingOutput = [];
		return output;
	}

	/**
	 * Write data to the terminal emulator (synchronous, non-blocking)
	 * Data is buffered and will be processed asynchronously.
	 * Use writeSync() if you need to wait for the write to complete.
	 */
	write(data: string): void {
		if (this.disposed) return;

		if (!DEBUG_EMULATOR_TIMING) {
			// Parse escape sequences with chunk-safe buffering
			this.parseEscapeSequences(data);
			// Write to headless terminal (buffered/async)
			this.terminal.write(data);
			return;
		}

		const parseStart = performance.now();
		this.parseEscapeSequences(data);
		const parseTime = performance.now() - parseStart;

		const terminalStart = performance.now();
		this.terminal.write(data);
		const terminalTime = performance.now() - terminalStart;

		if (parseTime > 2 || terminalTime > 2) {
			console.warn(
				`[HeadlessEmulator] write(${data.length}b): parse=${parseTime.toFixed(1)}ms, terminal=${terminalTime.toFixed(1)}ms`,
			);
		}
	}

	/**
	 * Write data to the terminal emulator and wait for completion.
	 * Use this when you need to ensure data is processed before reading state.
	 */
	async writeSync(data: string): Promise<void> {
		if (this.disposed) return;

		// Parse escape sequences with chunk-safe buffering
		this.parseEscapeSequences(data);

		// Write to headless terminal and wait for completion
		return new Promise<void>((resolve) => {
			this.terminal.write(data, () => resolve());
		});
	}

	/**
	 * Resize the terminal
	 */
	resize(cols: number, rows: number): void {
		if (this.disposed) return;
		this.terminal.resize(cols, rows);
	}

	/**
	 * Get current terminal dimensions
	 */
	getDimensions(): { cols: number; rows: number } {
		return {
			cols: this.terminal.cols,
			rows: this.terminal.rows,
		};
	}

	/**
	 * Get current terminal modes
	 */
	getModes(): TerminalModes {
		return { ...this.modes };
	}

	/**
	 * Get current working directory (from OSC-7)
	 */
	getCwd(): string | null {
		return this.cwd;
	}

	/**
	 * Set CWD directly (for initial session setup)
	 */
	setCwd(cwd: string): void {
		this.cwd = cwd;
	}

	/**
	 * Get scrollback line count
	 */
	getScrollbackLines(): number {
		return this.terminal.buffer.active.length;
	}

	/**
	 * Flush all pending writes to the terminal.
	 * Call this before getSnapshot() if you've written data without waiting.
	 */
	async flush(): Promise<void> {
		if (this.disposed) return;
		// Write an empty string with callback to ensure all pending writes are processed
		return new Promise<void>((resolve) => {
			this.terminal.write("", () => resolve());
		});
	}

	/**
	 * Generate a complete snapshot for session restore.
	 * Note: Call flush() first if you have pending async writes.
	 */
	getSnapshot(): TerminalSnapshot {
		const snapshotAnsi = this.serializeAddon.serialize({
			scrollback: this.terminal.options.scrollback ?? 10000,
		});

		const rehydrateSequences = this.generateRehydrateSequences();

		// Build debug diagnostics
		const xtermBufferType = this.terminal.buffer.active.type;
		const hasAltScreenEntry = snapshotAnsi.includes("\x1b[?1049h");

		let altBufferDebug:
			| {
					lines: number;
					nonEmptyLines: number;
					totalChars: number;
					cursorX: number;
					cursorY: number;
					sampleLines: string[];
			  }
			| undefined;

		if (this.modes.alternateScreen || xtermBufferType === "alternate") {
			const altBuffer = this.terminal.buffer.alternate;
			let nonEmptyLines = 0;
			let totalChars = 0;
			const sampleLines: string[] = [];

			for (let i = 0; i < altBuffer.length; i++) {
				const line = altBuffer.getLine(i);
				if (line) {
					const lineText = line.translateToString(true);
					if (lineText.trim().length > 0) {
						nonEmptyLines++;
						totalChars += lineText.length;
						if (sampleLines.length < 3) {
							sampleLines.push(lineText.slice(0, 80));
						}
					}
				}
			}

			altBufferDebug = {
				lines: altBuffer.length,
				nonEmptyLines,
				totalChars,
				cursorX: altBuffer.cursorX,
				cursorY: altBuffer.cursorY,
				sampleLines,
			};
		}

		return {
			snapshotAnsi,
			rehydrateSequences,
			cwd: this.cwd,
			modes: { ...this.modes },
			cols: this.terminal.cols,
			rows: this.terminal.rows,
			scrollbackLines: this.getScrollbackLines(),
			debug: {
				xtermBufferType,
				hasAltScreenEntry,
				altBuffer: altBufferDebug,
				normalBufferLines: this.terminal.buffer.normal.length,
			},
		};
	}

	/**
	 * Generate a complete snapshot after flushing pending writes.
	 * This is the preferred method for getting consistent snapshots.
	 */
	async getSnapshotAsync(): Promise<TerminalSnapshot> {
		await this.flush();
		return this.getSnapshot();
	}

	/**
	 * Clear terminal buffer
	 */
	clear(): void {
		if (this.disposed) return;
		this.terminal.clear();
	}

	/**
	 * Reset terminal to default state
	 */
	reset(): void {
		if (this.disposed) return;
		this.terminal.reset();
		this.modes = { ...DEFAULT_MODES };
	}

	/**
	 * Dispose of the terminal
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.terminal.dispose();
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Parse escape sequences with chunk-safe buffering.
	 * PTY output can split sequences across chunks, so we buffer partial sequences.
	 *
	 * IMPORTANT: We only buffer sequences we actually track (DECSET/DECRST and OSC-7).
	 * Other escape sequences (colors, cursor moves, etc.) are NOT buffered to prevent
	 * memory leaks from unbounded buffer growth.
	 */
	private parseEscapeSequences(data: string): void {
		// Prepend any buffered partial sequence from previous chunk
		const fullData = this.escapeSequenceBuffer + data;
		this.escapeSequenceBuffer = "";

		// Parse complete sequences in the data
		this.parseModeChanges(fullData);
		this.parseOsc7(fullData);

		// Check for incomplete sequences we care about at the end
		// We only buffer DECSET/DECRST (ESC[?...) and OSC-7 (ESC]7;...)
		const incompleteSequence = this.findIncompleteTrackedSequence(fullData);

		if (incompleteSequence) {
			// Cap buffer size to prevent unbounded growth
			if (
				incompleteSequence.length <= HeadlessEmulator.MAX_ESCAPE_BUFFER_SIZE
			) {
				this.escapeSequenceBuffer = incompleteSequence;
			}
			// If buffer too large, just discard it (likely malformed or attack)
		}
	}

	/**
	 * Find an incomplete DECSET/DECRST or OSC-7 sequence at the end of data.
	 * Returns the incomplete sequence string, or null if none found.
	 *
	 * We ONLY buffer sequences we track:
	 * - DECSET/DECRST: ESC[?...h or ESC[?...l
	 * - OSC-7: ESC]7;...BEL or ESC]7;...ESC\
	 *
	 * Other CSI sequences (ESC[31m, ESC[H, etc.) are NOT buffered.
	 */
	private findIncompleteTrackedSequence(data: string): string | null {
		const escEscaped = escapeRegex(ESC);

		// Look for potential incomplete sequences from the end
		const lastEscIndex = data.lastIndexOf(ESC);
		if (lastEscIndex === -1) return null;

		const afterLastEsc = data.slice(lastEscIndex);

		// Check if this looks like a sequence we track

		// Pattern: ESC[? - start of DECSET/DECRST
		if (afterLastEsc.startsWith(`${ESC}[?`)) {
			// Check if it's complete (ends with h or l after digits)
			const completePattern = new RegExp(`${escEscaped}\\[\\?[0-9;]+[hl]`);
			if (completePattern.test(afterLastEsc)) {
				// Complete DECSET/DECRST - check if there's another incomplete after
				const globalPattern = new RegExp(`${escEscaped}\\[\\?[0-9;]+[hl]`, "g");
				const matches = afterLastEsc.match(globalPattern);
				if (matches) {
					const lastMatch = matches[matches.length - 1];
					const lastMatchEnd =
						afterLastEsc.lastIndexOf(lastMatch) + lastMatch.length;
					const remainder = afterLastEsc.slice(lastMatchEnd);
					if (remainder.includes(ESC)) {
						return this.findIncompleteTrackedSequence(remainder);
					}
				}
				return null; // Complete
			}
			// Incomplete DECSET/DECRST - buffer it
			return afterLastEsc;
		}

		// Pattern: ESC]7; - start of OSC-7
		if (afterLastEsc.startsWith(`${ESC}]7;`)) {
			// Check if it's complete (ends with BEL or ESC\)
			if (afterLastEsc.includes(BEL) || afterLastEsc.includes(`${ESC}\\`)) {
				return null; // Complete
			}
			// Incomplete OSC-7 - buffer it
			return afterLastEsc;
		}

		// Check for partial starts of tracked sequences
		// These could become tracked sequences with more data
		if (afterLastEsc === ESC) return afterLastEsc; // Just ESC
		if (afterLastEsc === `${ESC}[`) return afterLastEsc; // ESC[
		if (afterLastEsc === `${ESC}]`) return afterLastEsc; // ESC]
		if (afterLastEsc === `${ESC}]7`) return afterLastEsc; // ESC]7
		const incompleteDecset = new RegExp(`^${escEscaped}\\[\\?[0-9;]*$`);
		if (incompleteDecset.test(afterLastEsc)) return afterLastEsc; // ESC[?123

		// Not a sequence we track (e.g., ESC[31m, ESC[H) - don't buffer
		return null;
	}

	/**
	 * Parse DECSET/DECRST sequences from terminal data
	 */
	private parseModeChanges(data: string): void {
		// Match CSI ? Pm h (DECSET) and CSI ? Pm l (DECRST)
		// Examples: ESC[?1h (enable app cursor), ESC[?2004l (disable bracketed paste)
		// Also handles multiple modes: ESC[?1;2004h
		// Using string-based regex to avoid control character linter errors
		const modeRegex = new RegExp(
			`${escapeRegex(ESC)}\\[\\?([0-9;]+)([hl])`,
			"g",
		);

		for (const match of data.matchAll(modeRegex)) {
			const modesStr = match[1];
			const action = match[2]; // 'h' = set (enable), 'l' = reset (disable)
			const enable = action === "h";

			// Split on semicolons for multiple modes
			const modeNumbers = modesStr
				.split(";")
				.map((s) => Number.parseInt(s, 10));

			for (const modeNum of modeNumbers) {
				const modeName = MODE_MAP[modeNum];
				if (modeName) {
					// For cursor visibility and auto-wrap, 'h' means true, 'l' means false
					// But their defaults are different (cursorVisible=true, autoWrap=true)
					this.modes[modeName] = enable;
				}
			}
		}
	}

	/**
	 * Parse OSC-7 sequences for CWD tracking
	 * Format: ESC]7;file://hostname/path BEL or ESC]7;file://hostname/path ESC\
	 *
	 * The path part starts after the hostname (after file://hostname).
	 * Hostname can be empty, localhost, or a machine name.
	 */
	private parseOsc7(data: string): void {
		// OSC-7 format: \x1b]7;file://hostname/path\x07
		// We need to extract the /path portion after the hostname
		// Hostname ends at the first / after file://

		// Pattern explanation:
		// - ESC ]7;file:// - the OSC-7 prefix
		// - [^/]* - the hostname (anything that's not a slash)
		// - (/.+?) - capture the path (starts with /, non-greedy)
		// - (?:BEL|ESC\\) - terminated by BEL or ST

		// Using string building to avoid control character linter issues
		const escEscaped = escapeRegex(ESC);
		const belEscaped = escapeRegex(BEL);

		// Match OSC-7 with either terminator
		const osc7Pattern = `${escEscaped}\\]7;file://[^/]*(/.+?)(?:${belEscaped}|${escEscaped}\\\\)`;
		const osc7Regex = new RegExp(osc7Pattern, "g");

		for (const match of data.matchAll(osc7Regex)) {
			if (match[1]) {
				try {
					this.cwd = decodeURIComponent(match[1]);
				} catch {
					// If decoding fails, use the raw path
					this.cwd = match[1];
				}
			}
		}
	}

	/**
	 * Generate escape sequences to restore current mode state
	 * These sequences should be written to a fresh xterm instance before
	 * writing the snapshot to ensure input behavior matches.
	 */
	private generateRehydrateSequences(): string {
		const sequences: string[] = [];

		// Helper to add DECSET/DECRST sequence
		const addModeSequence = (
			modeNum: number,
			enabled: boolean,
			defaultEnabled: boolean,
		) => {
			// Only add sequence if different from default
			if (enabled !== defaultEnabled) {
				sequences.push(`${ESC}[?${modeNum}${enabled ? "h" : "l"}`);
			}
		};

		// Application cursor keys (mode 1)
		addModeSequence(1, this.modes.applicationCursorKeys, false);

		// Origin mode (mode 6)
		addModeSequence(6, this.modes.originMode, false);

		// Auto-wrap mode (mode 7)
		addModeSequence(7, this.modes.autoWrap, true);

		// Cursor visibility (mode 25)
		addModeSequence(25, this.modes.cursorVisible, true);

		// Mouse tracking modes (mutually exclusive typically, but we track all)
		addModeSequence(9, this.modes.mouseTrackingX10, false);
		addModeSequence(1000, this.modes.mouseTrackingNormal, false);
		addModeSequence(1001, this.modes.mouseTrackingHighlight, false);
		addModeSequence(1002, this.modes.mouseTrackingButtonEvent, false);
		addModeSequence(1003, this.modes.mouseTrackingAnyEvent, false);

		// Mouse encoding modes
		addModeSequence(1005, this.modes.mouseUtf8, false);
		addModeSequence(1006, this.modes.mouseSgr, false);

		// Focus reporting (mode 1004)
		addModeSequence(1004, this.modes.focusReporting, false);

		// Bracketed paste (mode 2004)
		addModeSequence(2004, this.modes.bracketedPaste, false);

		// Note: We don't restore alternate screen mode (1049/47) here because
		// the serialized snapshot already contains the correct screen buffer.
		// Restoring it would cause incorrect behavior.

		return sequences.join("");
	}
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply a snapshot to a headless emulator (for testing round-trip)
 */
export function applySnapshot(
	emulator: HeadlessEmulator,
	snapshot: TerminalSnapshot,
): void {
	// First, write the rehydrate sequences to restore mode state
	emulator.write(snapshot.rehydrateSequences);

	// Then write the serialized screen content
	emulator.write(snapshot.snapshotAnsi);
}

/**
 * Compare two mode states for equality
 */
export function modesEqual(a: TerminalModes, b: TerminalModes): boolean {
	return (
		a.applicationCursorKeys === b.applicationCursorKeys &&
		a.bracketedPaste === b.bracketedPaste &&
		a.mouseTrackingX10 === b.mouseTrackingX10 &&
		a.mouseTrackingNormal === b.mouseTrackingNormal &&
		a.mouseTrackingHighlight === b.mouseTrackingHighlight &&
		a.mouseTrackingButtonEvent === b.mouseTrackingButtonEvent &&
		a.mouseTrackingAnyEvent === b.mouseTrackingAnyEvent &&
		a.focusReporting === b.focusReporting &&
		a.mouseUtf8 === b.mouseUtf8 &&
		a.mouseSgr === b.mouseSgr &&
		a.alternateScreen === b.alternateScreen &&
		a.cursorVisible === b.cursorVisible &&
		a.originMode === b.originMode &&
		a.autoWrap === b.autoWrap
	);
}
