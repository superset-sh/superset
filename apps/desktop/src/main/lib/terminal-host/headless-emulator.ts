/**
 * Headless Terminal Emulator
 *
 * Raw ANSI stream buffer with:
 * - Mode tracking (DECSET/DECRST parsing)
 * - Snapshot generation (raw ANSI output)
 * - Rehydration sequence generation for mode restoration
 * - OSC-7 CWD tracking
 *
 * Replaces @xterm/headless — the renderer's ghostty-web terminal replays
 * the raw PTY output correctly.
 */

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
// Scrollback Buffer
// =============================================================================

/** Maximum buffer size in bytes (~10MB) to bound memory */
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

class ScrollbackBuffer {
	private chunks: string[] = [];
	private totalLength = 0;

	write(data: string): void {
		this.chunks.push(data);
		this.totalLength += data.length;

		// Trim from the front if we exceed the cap
		while (this.totalLength > MAX_BUFFER_SIZE && this.chunks.length > 1) {
			const removed = this.chunks.shift()!;
			this.totalLength -= removed.length;
		}
	}

	getContent(): string {
		return this.chunks.join("");
	}

	clear(): void {
		this.chunks = [];
		this.totalLength = 0;
	}

	get length(): number {
		return this.totalLength;
	}
}

// =============================================================================
// Headless Emulator Class
// =============================================================================

export interface HeadlessEmulatorOptions {
	cols?: number;
	rows?: number;
	scrollback?: number;
}

export class HeadlessEmulator {
	private buffer: ScrollbackBuffer;
	private modes: TerminalModes;
	private cwd: string | null = null;
	private disposed = false;
	private cols: number;
	private rows: number;

	// Pending output buffer for query responses
	private pendingOutput: string[] = [];

	// Buffer for partial escape sequences that span chunk boundaries
	private escapeSequenceBuffer = "";

	// Maximum buffer size to prevent unbounded growth (safety cap)
	private static readonly MAX_ESCAPE_BUFFER_SIZE = 1024;

	constructor(options: HeadlessEmulatorOptions = {}) {
		const { cols = 80, rows = 24 } = options;

		this.cols = cols;
		this.rows = rows;
		this.buffer = new ScrollbackBuffer();

		// Initialize mode state
		this.modes = { ...DEFAULT_MODES };
	}

	/**
	 * Set callback for terminal-generated output (query responses)
	 * Note: In the raw buffer approach, responses are collected via pendingOutput
	 * and flushed with flushPendingOutput(). This method is kept for API compatibility.
	 */
	onData(_callback: (data: string) => void): void {
		// No-op: raw buffer approach uses pendingOutput + flushPendingOutput() instead
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
	 * Write data to the emulator (synchronous).
	 * Parses escape sequences for mode/CWD tracking and appends to buffer.
	 */
	write(data: string): void {
		if (this.disposed) return;

		if (!DEBUG_EMULATOR_TIMING) {
			this.parseEscapeSequences(data);
			this.buffer.write(data);
			return;
		}

		const parseStart = performance.now();
		this.parseEscapeSequences(data);
		const parseTime = performance.now() - parseStart;

		const bufferStart = performance.now();
		this.buffer.write(data);
		const bufferTime = performance.now() - bufferStart;

		if (parseTime > 2 || bufferTime > 2) {
			console.warn(
				`[HeadlessEmulator] write(${data.length}b): parse=${parseTime.toFixed(1)}ms, buffer=${bufferTime.toFixed(1)}ms`,
			);
		}
	}

	/**
	 * Write data synchronously (same as write() since buffer is synchronous).
	 */
	async writeSync(data: string): Promise<void> {
		this.write(data);
	}

	/**
	 * Resize the terminal (store dimensions only)
	 */
	resize(cols: number, rows: number): void {
		if (this.disposed) return;
		this.cols = cols;
		this.rows = rows;
	}

	/**
	 * Get current terminal dimensions
	 */
	getDimensions(): { cols: number; rows: number } {
		return {
			cols: this.cols,
			rows: this.rows,
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
	 * Get approximate scrollback size
	 */
	getScrollbackLines(): number {
		// Approximate line count from buffer size
		const content = this.buffer.getContent();
		if (!content) return 0;
		let count = 1;
		for (let i = 0; i < content.length; i++) {
			if (content[i] === "\n") count++;
		}
		return count;
	}

	/**
	 * Flush is a no-op since writes are synchronous.
	 */
	async flush(): Promise<void> {
		// Synchronous buffer — nothing to flush
	}

	/**
	 * Generate a complete snapshot for session restore.
	 */
	getSnapshot(): TerminalSnapshot {
		const snapshotAnsi = this.buffer.getContent();
		const rehydrateSequences = this.generateRehydrateSequences();

		return {
			snapshotAnsi,
			rehydrateSequences,
			cwd: this.cwd,
			modes: { ...this.modes },
			cols: this.cols,
			rows: this.rows,
			scrollbackLines: this.getScrollbackLines(),
			debug: {
				xtermBufferType: this.modes.alternateScreen ? "alternate" : "normal",
				hasAltScreenEntry: snapshotAnsi.includes("\x1b[?1049h"),
				normalBufferLines: this.getScrollbackLines(),
			},
		};
	}

	/**
	 * Generate a complete snapshot (same as sync version since buffer is synchronous).
	 */
	async getSnapshotAsync(): Promise<TerminalSnapshot> {
		return this.getSnapshot();
	}

	/**
	 * Clear terminal buffer
	 */
	clear(): void {
		if (this.disposed) return;
		this.buffer.clear();
	}

	/**
	 * Reset terminal to default state
	 */
	reset(): void {
		if (this.disposed) return;
		this.buffer.clear();
		this.modes = { ...DEFAULT_MODES };
	}

	/**
	 * Dispose of the emulator
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.buffer.clear();
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
					this.modes[modeName] = enable;
				}
			}
		}
	}

	/**
	 * Parse OSC-7 sequences for CWD tracking
	 * Format: ESC]7;file://hostname/path BEL or ESC]7;file://hostname/path ESC\
	 */
	private parseOsc7(data: string): void {
		const escEscaped = escapeRegex(ESC);
		const belEscaped = escapeRegex(BEL);

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
	 */
	private generateRehydrateSequences(): string {
		const sequences: string[] = [];

		const addModeSequence = (
			modeNum: number,
			enabled: boolean,
			defaultEnabled: boolean,
		) => {
			if (enabled !== defaultEnabled) {
				sequences.push(`${ESC}[?${modeNum}${enabled ? "h" : "l"}`);
			}
		};

		addModeSequence(1, this.modes.applicationCursorKeys, false);
		addModeSequence(6, this.modes.originMode, false);
		addModeSequence(7, this.modes.autoWrap, true);
		addModeSequence(25, this.modes.cursorVisible, true);
		addModeSequence(9, this.modes.mouseTrackingX10, false);
		addModeSequence(1000, this.modes.mouseTrackingNormal, false);
		addModeSequence(1001, this.modes.mouseTrackingHighlight, false);
		addModeSequence(1002, this.modes.mouseTrackingButtonEvent, false);
		addModeSequence(1003, this.modes.mouseTrackingAnyEvent, false);
		addModeSequence(1005, this.modes.mouseUtf8, false);
		addModeSequence(1006, this.modes.mouseSgr, false);
		addModeSequence(1004, this.modes.focusReporting, false);
		addModeSequence(2004, this.modes.bracketedPaste, false);

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
	emulator.write(snapshot.rehydrateSequences);
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
