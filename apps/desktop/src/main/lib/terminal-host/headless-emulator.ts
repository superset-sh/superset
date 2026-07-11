/**
 * Headless Terminal Emulator
 *
 * Wraps @xterm/headless with:
 * - Mode tracking via parser handlers on the internal terminal
 * - Foreground-reclaim of TUI-leaked input modes at shell prompts (#4949)
 * - Snapshot generation via @xterm/addon-serialize
 * - Rehydration sequence generation for mode restoration
 */

import "../../terminal-host/xterm-env-polyfill";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/headless";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";
import {
	FOREGROUND_RECLAIM_RESET_ANSI_PARAMS,
	FOREGROUND_RECLAIM_RESET_PARAMS,
} from "shared/terminal-input-modes";
import {
	DEFAULT_MODES,
	type TerminalModes,
	type TerminalSnapshot,
} from "./types";

// =============================================================================
// Mode Tracking Constants
// =============================================================================

const ESC = "\x1b";

/**
 * OSC 777;superset-shell-ready — the app-private half of the prompt marker
 * pair the shell wrappers print before every prompt (see shell-wrappers.ts).
 * Its arrival means the shell owns the foreground again, so input-reporting
 * modes armed since the previous prompt were leaked by a TUI that died
 * without disarming them (#4949).
 *
 * The FinalTerm OSC 133;A the wrappers co-emit is deliberately NOT a reclaim
 * trigger:
 * - Third-party shell integrations (iTerm2, fish's native integration) emit
 *   133;A at prompts of shells we did not wrap — including shells running
 *   *inside* a live tmux, whose forwarded markers must not clear tmux's own
 *   mouse modes.
 * - A tmux-passthrough wrapper (`ESC Ptmux; ESC ESC ]133;A BEL ESC \`)
 *   genuinely dispatches OSC 133 in this xterm build — the doubled ESC exits
 *   the DCS via the parser's anywhere-ESC rule — so even parser-level
 *   detection cannot tell it from a real prompt.
 * - The shell-ready scanner strips the *first* 133;A before it reaches this
 *   emulator (session.ts), which would skew prompt-epoch tracking.
 * Only Superset's own wrappers emit the 777 marker, and the scanner never
 * strips it, so it is visible at every prompt including the first.
 *
 * Known residual: replaying a raw log that *contains* captured 777 markers
 * (e.g. `cat` over an agent session log) re-dispatches them and can reclaim a
 * concurrently armed TUI's modes. That is in-band indistinguishable from a
 * real prompt by construction and is accepted (#5519 B2c).
 */
const RECLAIM_MARKER_OSC_IDENT = 777;
const RECLAIM_MARKER_PAYLOAD = "superset-shell-ready";

/**
 * DECSET/DECRST mode numbers we track
 *
 * 1001 (highlight mouse tracking) is deliberately absent: this xterm build
 * implements no such mode — InputHandler has no 1001 case (set or reset),
 * `modes.mouseTrackingMode` has no 'highlight' member, and SerializeAddon can
 * never emit `?1001h` — so the internal terminal and the renderer both treat
 * DECSET/DECRST 1001 as no-ops. Tracking it would make the shadow map diverge
 * from them: `?1001h` would supersede a level (and its shell-owned grant)
 * that physically stays armed, and `?1001l` would clear a protocol the
 * terminal still has active.
 */
const MODE_MAP: Record<number, keyof TerminalModes> = {
	1: "applicationCursorKeys",
	6: "originMode",
	7: "autoWrap",
	9: "mouseTrackingX10",
	25: "cursorVisible",
	45: "reverseWraparound",
	47: "alternateScreen", // Legacy alternate screen
	1000: "mouseTrackingNormal",
	1002: "mouseTrackingButtonEvent",
	1003: "mouseTrackingAnyEvent",
	1004: "focusReporting",
	1005: "mouseUtf8",
	1006: "mouseSgr",
	1049: "alternateScreen", // Modern alternate screen with save/restore
	2004: "bracketedPaste",
	2031: "colorSchemeReporting",
};

/**
 * ANSI (SM/RM, no `?` prefix) mode numbers we track
 */
const ANSI_MODE_MAP: Record<number, keyof TerminalModes> = {
	4: "insertMode",
};

/** Shadow-map keys cleared by a foreground reclaim. */
const RECLAIMABLE_MODE_NAMES: ReadonlySet<keyof TerminalModes> = new Set(
	[
		...[...FOREGROUND_RECLAIM_RESET_PARAMS].map((mode) => MODE_MAP[mode]),
		...[...FOREGROUND_RECLAIM_RESET_ANSI_PARAMS].map(
			(mode) => ANSI_MODE_MAP[mode],
		),
	].filter((name): name is keyof TerminalModes => name !== undefined),
);

const MOUSE_PROTOCOL_MODE_NAMES = [
	"mouseTrackingX10",
	"mouseTrackingNormal",
	"mouseTrackingButtonEvent",
	"mouseTrackingAnyEvent",
] as const satisfies readonly (keyof TerminalModes)[];

const MOUSE_PROTOCOL_MODE_NAME_SET: ReadonlySet<keyof TerminalModes> = new Set(
	MOUSE_PROTOCOL_MODE_NAMES,
);

/**
 * The exact single-mode sequences SerializeAddon emits for state this
 * emulator can reclaim (see reconcileSnapshotModes). Serialized cell content
 * can never contain these byte strings — escape sequences are consumed by
 * the parser, never stored in cells — so a global strip is precise.
 */
const SERIALIZED_MOUSE_PROTOCOL_SEQUENCES = [9, 1000, 1002, 1003].map(
	(mode) => `${ESC}[?${mode}h`,
);

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
	private onForegroundReclaimCallback?: () => void;

	// Prompt-epoch tracking. Reclaimable modes armed before the first prompt
	// marker were set up by shell init files (.zshrc printf and friends) — the
	// shell owns them, and a reclaim must leave them alone until the owner
	// releases them with an explicit DECRST.
	private sawPromptMarker = false;
	private shellOwnedModes = new Set<keyof TerminalModes>();

	// Modes cleared by reclaims whose disarm still has to reach live-attached
	// clients (see takeForegroundReclaimClientDisarm).
	private pendingClientDisarmModes = new Set<keyof TerminalModes>();

	constructor(options: HeadlessEmulatorOptions = {}) {
		const {
			cols = 80,
			rows = 24,
			scrollback = DEFAULT_TERMINAL_SCROLLBACK,
		} = options;

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

		// Shadow-track modes with parser handlers on the internal terminal
		// instead of a regex over raw chunks: handlers fire in exact stream
		// order at real parse boundaries, are chunk-safe for split sequences,
		// see C1-introduced (0x9b/0x9d) sequences the same way the terminal
		// does, and never fire from DCS payload the parser is consuming.
		// Returning false lets xterm's own handlers apply the modes too.
		const parser = this.terminal.parser;
		parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
			this.applyTrackedModes(MODE_MAP, params, true);
			return false;
		});
		parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
			this.applyTrackedModes(MODE_MAP, params, false);
			return false;
		});
		parser.registerCsiHandler({ final: "h" }, (params) => {
			this.applyTrackedModes(ANSI_MODE_MAP, params, true);
			return false;
		});
		parser.registerCsiHandler({ final: "l" }, (params) => {
			this.applyTrackedModes(ANSI_MODE_MAP, params, false);
			return false;
		});
		parser.registerOscHandler(RECLAIM_MARKER_OSC_IDENT, (data) => {
			// Exact payload match: OSC 777 is also urxvt's notification channel
			// (`777;notify;…`), which must not read as a prompt.
			if (data === RECLAIM_MARKER_PAYLOAD) this.handlePromptMarker();
			return false;
		});
		parser.registerOscHandler(7, (data) => {
			this.applyOsc7(data);
			return false;
		});

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
	 * Set callback fired when a prompt marker clears leaked modes from the
	 * shadow map. Fires mid-parse; consumers should settle their pipeline and
	 * then collect takeForegroundReclaimClientDisarm().
	 */
	onForegroundReclaim(callback: () => void): void {
		this.onForegroundReclaimCallback = callback;
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
		this.terminal.write(data);
	}

	/**
	 * Write data to the terminal emulator and wait for completion.
	 * Use this when you need to ensure data is processed before reading state.
	 */
	async writeSync(data: string): Promise<void> {
		if (this.disposed) return;
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
		const snapshotAnsi = this.reconcileSnapshotModes(
			this.serializeAddon.serialize({
				scrollback:
					this.terminal.options.scrollback ?? DEFAULT_TERMINAL_SCROLLBACK,
			}),
		);

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
		this.sawPromptMarker = false;
		this.shellOwnedModes.clear();
		this.pendingClientDisarmModes.clear();
	}

	/**
	 * Dispose of the terminal
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.terminal.dispose();
	}

	/**
	 * DECRSTs a live-attached renderer needs after a foreground reclaim: the
	 * renderer received the leaked armings as raw stream data, so without this
	 * a TUI SIGKILLed *while the pane is attached* keeps spewing mouse reports
	 * into the fresh prompt (#4949). Consumes the pending set.
	 *
	 * Each group is re-checked against the current shadow state so a TUI that
	 * armed modes after the marker (fg after ^Z, or a new TUI racing the
	 * reclaim across chunks) is never disarmed — in xterm, resetting any mouse
	 * level clears the whole protocol.
	 */
	takeForegroundReclaimClientDisarm(): string {
		if (this.pendingClientDisarmModes.size === 0) return "";
		const pending = this.pendingClientDisarmModes;
		this.pendingClientDisarmModes = new Set();

		let disarm = "";
		const mousePending = MOUSE_PROTOCOL_MODE_NAMES.some((name) =>
			pending.has(name),
		);
		if (mousePending && !this.isAnyMouseProtocolArmed()) {
			disarm += `${ESC}[?1003l`;
		}
		if (pending.has("focusReporting") && !this.modes.focusReporting) {
			disarm += `${ESC}[?1004l`;
		}
		if (
			pending.has("colorSchemeReporting") &&
			!this.modes.colorSchemeReporting
		) {
			disarm += `${ESC}[?2031l`;
		}
		if (pending.has("originMode") && !this.modes.originMode) {
			disarm += `${ESC}[?6l`;
		}
		if (pending.has("reverseWraparound") && !this.modes.reverseWraparound) {
			disarm += `${ESC}[?45l`;
		}
		if (pending.has("insertMode") && !this.modes.insertMode) {
			disarm += `${ESC}[4l`;
		}
		return disarm;
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Apply a DECSET/DECRST or ANSI SM/RM to the shadow map, in stream order
	 * (this runs from a parser handler at the sequence's dispatch point).
	 */
	private applyTrackedModes(
		map: Record<number, keyof TerminalModes>,
		params: (number | number[])[],
		enable: boolean,
	): void {
		for (const param of params) {
			// A param with colon sub-parameters arrives as an array; key on the
			// primary value.
			const primary = typeof param === "number" ? param : param[0];
			const modeName = primary === undefined ? undefined : map[primary];
			if (!modeName) continue;
			// The mouse protocol is one mutually-exclusive unit in xterm:
			// arming any level supersedes the previous one, and resetting any
			// level clears the protocol entirely. Mirror that here, ownership
			// included — a superseded shell-owned level is physically gone
			// from the terminal, so its stale grant must not make the mouse
			// group look armed and shield a dead TUI's protocol from reclaim.
			if (MOUSE_PROTOCOL_MODE_NAME_SET.has(modeName)) {
				for (const sibling of MOUSE_PROTOCOL_MODE_NAMES) {
					if (enable && sibling === modeName) continue;
					this.modes[sibling] = false;
					this.shellOwnedModes.delete(sibling);
				}
			}
			this.modes[modeName] = enable;
			if (!RECLAIMABLE_MODE_NAMES.has(modeName)) continue;
			if (enable) {
				// Armed before the first prompt marker → shell init owns it. A
				// re-arm after a marker leaves an existing grant intact (the
				// shell still wants the mode regardless of who re-armed it).
				if (!this.sawPromptMarker) this.shellOwnedModes.add(modeName);
			} else {
				// The owner (or anyone) released it; the next arming decides
				// ownership afresh.
				this.shellOwnedModes.delete(modeName);
			}
		}
	}

	/**
	 * The shell owns the foreground again: clear reclaimable modes that were
	 * armed since the last prompt and never released — a TUI that exited
	 * cleanly would have disarmed them itself. Shell-owned modes (armed during
	 * shell init, before the first marker) survive.
	 *
	 * Only the shadow map changes here. The internal terminal is deliberately
	 * left armed: writing disarm bytes into it can land inside an escape
	 * sequence split across PTY chunks (session.ts hard-splits at 8192 chars),
	 * aborting the half-parsed sequence and baking its tail into every future
	 * snapshot as junk text. Snapshots reconcile at read time instead
	 * (reconcileSnapshotModes), and live clients get a settled, re-checked
	 * disarm (takeForegroundReclaimClientDisarm).
	 */
	private handlePromptMarker(): void {
		this.sawPromptMarker = true;
		let cleared = false;
		for (const modeName of RECLAIMABLE_MODE_NAMES) {
			if (!this.modes[modeName]) continue;
			if (this.shellOwnedModes.has(modeName)) continue;
			this.modes[modeName] = DEFAULT_MODES[modeName];
			this.pendingClientDisarmModes.add(modeName);
			cleared = true;
		}
		if (cleared) this.onForegroundReclaimCallback?.();
	}

	private isAnyMouseProtocolArmed(): boolean {
		return MOUSE_PROTOCOL_MODE_NAMES.some((name) => this.modes[name]);
	}

	/**
	 * Drop the mode sequences SerializeAddon re-derived from the internal
	 * terminal when the shadow map says a reclaim turned them off. The two
	 * only disagree about reclaimed modes — both are fed by the same parse —
	 * so this is the entire diff, and the snapshot stops re-arming a dead
	 * TUI's modes on warm reattach without ever injecting bytes into the
	 * terminal's input stream.
	 */
	private reconcileSnapshotModes(snapshotAnsi: string): string {
		let result = snapshotAnsi;
		const strip = (sequence: string) => {
			if (result.includes(sequence)) {
				result = result.split(sequence).join("");
			}
		};
		if (!this.isAnyMouseProtocolArmed()) {
			for (const sequence of SERIALIZED_MOUSE_PROTOCOL_SEQUENCES) {
				strip(sequence);
			}
		}
		if (!this.modes.focusReporting) strip(`${ESC}[?1004h`);
		if (!this.modes.originMode) strip(`${ESC}[?6h`);
		if (!this.modes.reverseWraparound) strip(`${ESC}[?45h`);
		if (!this.modes.insertMode) strip(`${ESC}[4h`);
		return result;
	}

	/**
	 * Track CWD from OSC-7 payloads (`file://hostname/path`). The hostname may
	 * be empty, localhost, or a machine name; the path starts at the first `/`
	 * after it.
	 */
	private applyOsc7(data: string): void {
		const match = /^file:\/\/[^/]*(\/.*)$/.exec(data);
		if (!match?.[1]) return;
		try {
			this.cwd = decodeURIComponent(match[1]);
		} catch {
			// If decoding fails, use the raw path
			this.cwd = match[1];
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

		// Reverse wraparound (mode 45)
		addModeSequence(45, this.modes.reverseWraparound, false);

		// Mouse tracking modes (one exclusive protocol — at most one is armed)
		addModeSequence(9, this.modes.mouseTrackingX10, false);
		addModeSequence(1000, this.modes.mouseTrackingNormal, false);
		addModeSequence(1002, this.modes.mouseTrackingButtonEvent, false);
		addModeSequence(1003, this.modes.mouseTrackingAnyEvent, false);

		// Mouse encoding modes
		addModeSequence(1005, this.modes.mouseUtf8, false);
		addModeSequence(1006, this.modes.mouseSgr, false);

		// Focus reporting (mode 1004)
		addModeSequence(1004, this.modes.focusReporting, false);

		// Bracketed paste (mode 2004)
		addModeSequence(2004, this.modes.bracketedPaste, false);

		// Color-scheme update reports (mode 2031)
		addModeSequence(2031, this.modes.colorSchemeReporting, false);

		// Insert mode is an ANSI mode (CSI 4 h), not a DECSET
		if (this.modes.insertMode) {
			sequences.push(`${ESC}[4h`);
		}

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
		a.mouseTrackingButtonEvent === b.mouseTrackingButtonEvent &&
		a.mouseTrackingAnyEvent === b.mouseTrackingAnyEvent &&
		a.focusReporting === b.focusReporting &&
		a.mouseUtf8 === b.mouseUtf8 &&
		a.mouseSgr === b.mouseSgr &&
		a.alternateScreen === b.alternateScreen &&
		a.cursorVisible === b.cursorVisible &&
		a.originMode === b.originMode &&
		a.autoWrap === b.autoWrap &&
		a.insertMode === b.insertMode &&
		a.reverseWraparound === b.reverseWraparound &&
		a.colorSchemeReporting === b.colorSchemeReporting
	);
}
