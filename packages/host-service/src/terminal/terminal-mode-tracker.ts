// Tracks terminal-mode state (kitty keyboard, bracketed paste, focus, mouse,
// app cursor, …) by feeding every PTY-output chunk through a headless
// xterm.js. `buildPreamble()` returns the byte sequence that brings a freshly
// reattached renderer xterm back to the modes the running program already
// believes are active.
//
// Live programs typically set these modes ONCE at startup (e.g. codex emits
// `\x1b[>7u` to enable kitty keyboard). Those bytes are broadcast straight to
// the live socket and never enter the FIFO replay, so a renderer reload
// reattaches a fresh xterm with default modes — Shift+Enter starts submitting
// instead of inserting newline, paste arrives as keystrokes, etc.
//
// Pattern adapted from VSCode's XtermSerializer
// (src/vs/platform/terminal/node/ptyService.ts).

import { Terminal as HeadlessTerminal } from "@xterm/headless";

export interface ModeTracker {
	feed(bytes: Uint8Array): void;
	resize(cols: number, rows: number): void;
	buildPreamble(): Uint8Array | null;
	dispose(): void;
}

// Reaches into private xterm internals: synchronous parsing and kitty
// keyboard flags aren't on the public API, but @xterm/headless and
// @xterm/xterm share the same engine, so the shape is stable. Used the same
// way by xterm's own SerializeAddon.
type HeadlessInternals = {
	_core?: {
		_writeBuffer?: { writeSync(data: string | Uint8Array): void };
		coreService?: { kittyKeyboard?: { flags: number } };
		optionsService?: {
			rawOptions: { vtExtensions?: { kittyKeyboard?: boolean } };
		};
	};
};

export function createModeTracker(cols: number, rows: number): ModeTracker {
	const term = new HeadlessTerminal({
		cols,
		rows,
		// Tracker reads modes, never cells — keep scrollback minimal.
		scrollback: 1,
		allowProposedApi: true,
	});
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

	// `Terminal.write` is async-buffered, so `term.modes` lags behind feeds.
	// Pump synchronously through the internal WriteBuffer so the preamble can
	// be built immediately after a feed in the WS-attach hot path.

	const buildPreamble = (): Uint8Array | null => {
		const m = term.modes;
		const parts: string[] = [];

		if (m.applicationCursorKeysMode) parts.push("\x1b[?1h");
		if (m.applicationKeypadMode) parts.push("\x1b[?66h");
		if (m.bracketedPasteMode) parts.push("\x1b[?2004h");
		if (m.insertMode) parts.push("\x1b[4h");
		if (m.originMode) parts.push("\x1b[?6h");
		if (m.reverseWraparoundMode) parts.push("\x1b[?45h");
		if (m.sendFocusMode) parts.push("\x1b[?1004h");
		// Inverted: defaults true, only emit when explicitly disabled.
		if (!m.showCursor) parts.push("\x1b[?25l");
		if (!m.wraparoundMode) parts.push("\x1b[?7l");
		// synchronizedOutputMode intentionally omitted — re-asserting it on
		// attach would suspend rendering until the next end-marker.

		switch (m.mouseTrackingMode) {
			case "x10":
				parts.push("\x1b[?9h");
				break;
			case "vt200":
				parts.push("\x1b[?1000h");
				break;
			case "drag":
				parts.push("\x1b[?1002h");
				break;
			case "any":
				parts.push("\x1b[?1003h");
				break;
			case "none":
				break;
		}

		const kittyFlags = internals._core?.coreService?.kittyKeyboard?.flags ?? 0;
		if (kittyFlags > 0) {
			// `=N;1u` sets flags directly — restoring effective state to a
			// fresh peer, not modeling the program's push/pop stack.
			parts.push(`\x1b[=${kittyFlags};1u`);
		}

		if (parts.length === 0) return null;
		return new TextEncoder().encode(parts.join(""));
	};

	return {
		feed(bytes) {
			writeBuffer.writeSync(bytes);
		},
		resize(nextCols, nextRows) {
			if (term.cols === nextCols && term.rows === nextRows) return;
			term.resize(nextCols, nextRows);
		},
		buildPreamble,
		dispose() {
			term.dispose();
		},
	};
}
