import {
	TerminalModes,
	type TerminalModesSnapshot,
} from "@superset/pty-daemon/terminal-modes";
import { HeadlessTerminal } from "./headless-xterm.ts";

export interface ModeTracker {
	feed(bytes: Uint8Array): void;
	restoreModes(snapshot: TerminalModesSnapshot): void;
	resize(cols: number, rows: number): void;
	buildPreamble(): Uint8Array | null;
	isBracketedPasteActive(): boolean;
	isFocusReportingActive(): boolean;
	/** Current cursor position on the mirrored screen, 0-based viewport coords. */
	cursorPosition(): { x: number; y: number };
	snapshot(maxLines?: number): TerminalSnapshot;
	dispose(): void;
}

export interface ModeTrackerOptions {
	/**
	 * Called with disarm bytes when a shell prompt marker (OSC 777) flows
	 * through the stream while TUI-only input-reporting modes (kitty keyboard,
	 * mouse tracking, focus reporting) are still armed — the signature of a TUI
	 * killed uncleanly (#4949's host-side surface). Without this, the tracker
	 * believes the dead TUI's modes are live forever, so every attach preamble
	 * re-arms fresh renderers and each scroll/keypress sprays reports into the
	 * shell prompt as garbage. The callback should deliver the bytes into the
	 * session's output stream (which also feeds them back to this tracker).
	 */
	onLeakedInputModeDisarm?: (bytes: Uint8Array) => void;
}

export interface TerminalSnapshot {
	cols: number;
	rows: number;
	/** Plain text of the emulator buffer (alt-screen for TUI agents). */
	text: string;
}

// Headless xterm exposes neither synchronous parsing nor kitty enablement
// through its public API.
type HeadlessInternals = {
	_core?: {
		_writeBuffer?: { writeSync(data: string | Uint8Array): void };
		optionsService?: {
			rawOptions: { vtExtensions?: { kittyKeyboard?: boolean } };
		};
	};
};

export function createModeTracker(
	cols: number,
	rows: number,
	options: ModeTrackerOptions = {},
): ModeTracker {
	const term = new HeadlessTerminal({
		cols,
		rows,
		// Retains recent scrollback so `snapshot()` can serve line-mode history,
		// not just the visible screen. Irrelevant to alt-screen TUIs (no
		// scrollback), but cheap insurance for plain shell output.
		scrollback: 1000,
		allowProposedApi: true,
	});
	const modes = new TerminalModes();
	const internals = term as unknown as HeadlessInternals;

	// Validate the private surface up front so a future @xterm/headless
	// upgrade that renames internals fails loudly at session construction
	// rather than silently throwing inside every PTY-output callback.
	const optionsRaw = internals._core?.optionsService?.rawOptions;
	const writeBuffer = internals._core?._writeBuffer;
	if (!optionsRaw || typeof writeBuffer?.writeSync !== "function") {
		throw new Error(
			"@xterm/headless internals not found (optionsService.rawOptions, " +
				"_writeBuffer.writeSync). Likely a version-pinning regression — " +
				"check that the pinned version still exposes these.",
		);
	}

	// `vtExtensions.kittyKeyboard` is in the public typings but the headless
	// option sanitizer silently drops it (its DEFAULT_OPTIONS table omits the
	// key). Without this, kitty handlers early-return and `\x1b[>7u` is a
	// no-op. Set it on rawOptions directly.
	optionsRaw.vtExtensions = { kittyKeyboard: true };

	let disposed = false;

	let flushScheduled = false;

	const buildPreamble = () => modes.buildPreamble();

	const snapshot = (maxLines?: number): TerminalSnapshot => {
		const buffer = term.buffer.active;
		const total = buffer.length;
		const start = maxLines && maxLines > 0 ? Math.max(0, total - maxLines) : 0;
		const lines: string[] = [];
		for (let y = start; y < total; y++) {
			lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
		}
		// Trim trailing blank rows so the snapshot ends at real content.
		while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
		return { cols: term.cols, rows: term.rows, text: lines.join("\n") };
	};

	return {
		restoreModes(snapshot) {
			modes.restore(snapshot);
		},
		feed(bytes) {
			modes.feed(bytes);
			writeBuffer.writeSync(bytes);
			if (options.onLeakedInputModeDisarm && !flushScheduled) {
				flushScheduled = true;
				queueMicrotask(() => {
					flushScheduled = false;
					if (disposed) return;
					const disarm = modes.collectDisarm();
					if (disarm) options.onLeakedInputModeDisarm?.(disarm);
				});
			}
		},
		resize(nextCols, nextRows) {
			if (term.cols === nextCols && term.rows === nextRows) return;
			term.resize(nextCols, nextRows);
		},
		buildPreamble,
		isBracketedPasteActive() {
			return modes.isEnabled(2004);
		},
		isFocusReportingActive() {
			return modes.isEnabled(1004);
		},
		cursorPosition() {
			const buffer = term.buffer.active;
			return { x: buffer.cursorX, y: buffer.cursorY };
		},
		snapshot,
		dispose() {
			disposed = true;
			term.dispose();
		},
	};
}
