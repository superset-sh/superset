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

		// Parse for mode changes before writing to terminal
		this.parseModeChanges(data);

		// Parse for OSC-7 (CWD) sequences
		this.parseOsc7(data);

		// Write to headless terminal (buffered/async)
		this.terminal.write(data);
	}

	/**
	 * Write data to the terminal emulator and wait for completion.
	 * Use this when you need to ensure data is processed before reading state.
	 */
	async writeSync(data: string): Promise<void> {
		if (this.disposed) return;

		// Parse for mode changes before writing to terminal
		this.parseModeChanges(data);

		// Parse for OSC-7 (CWD) sequences
		this.parseOsc7(data);

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

		return {
			snapshotAnsi,
			rehydrateSequences,
			cwd: this.cwd,
			modes: { ...this.modes },
			cols: this.terminal.cols,
			rows: this.terminal.rows,
			scrollbackLines: this.getScrollbackLines(),
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
