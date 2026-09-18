import { describe, expect, test } from "bun:test";
import { Terminal } from "@xterm/headless";

/**
 * Reproduction for the "terminal scrolling" tracker (#5606), covering the
 * closed duplicates #3057 / #2937 / #2498:
 *
 *   "Scroll up while Claude Code is running and, as soon as it writes new
 *    output, the viewport jumps to the very top and I lose my place."
 *
 * The renderer writes streamed PTY output straight to xterm with no scroll
 * anchoring (see useTerminalStream.ts -> `xterm.write(event.data)` and the
 * unmounted-tab path in v1-terminal-cache.ts). xterm keeps the viewport
 * anchored to content by decrementing the scroll offset (`viewportY`) every
 * time a line is trimmed off the top of the scrollback. Once the scrollback
 * buffer is full — which it always is in a "relatively long Claude Code
 * session" (#3057) — every new line trims one old line, so a burst of output
 * drags a scrolled-up viewport all the way to line 0.
 *
 * These tests use @xterm/headless, which shares the exact VT parser + buffer +
 * scroll core with the @xterm/xterm build the renderer ships; only the DOM
 * renderer is absent. Production uses `scrollback: DEFAULT_TERMINAL_SCROLLBACK`
 * (5000); we use a small scrollback here so the buffer fills quickly, but the
 * trimming behaviour is identical.
 */

/** xterm parses writes on an internal queue; resolve once the chunk is applied. */
function write(term: Terminal, data: string): Promise<void> {
	return new Promise((resolve) => {
		term.write(data, () => resolve());
	});
}

function makeLines(from: number, to: number): string {
	let out = "";
	for (let i = from; i < to; i++) out += `line ${i}\r\n`;
	return out;
}

describe("terminal scroll preservation while output streams (#5606)", () => {
	test("baseline: output that does NOT overflow scrollback keeps the viewport in place", async () => {
		const term = new Terminal({ cols: 80, rows: 10, scrollback: 1000 });

		// Fill well under the scrollback cap so nothing is ever trimmed.
		await write(term, makeLines(0, 100));

		// User scrolls up to review earlier output.
		term.scrollToLine(20);
		expect(term.buffer.active.viewportY).toBe(20);

		// Claude keeps working and streams more output.
		await write(term, makeLines(100, 150));

		// No trimming happened, so the viewport must stay exactly where the
		// user left it. This is the behaviour users expect in every case.
		expect(term.buffer.active.viewportY).toBe(20);
	});

	// Reproduces the reported bug: with a FULL scrollback buffer (the steady
	// state of any long session), streaming output trims old lines and drags
	// the scrolled-up viewport to the very top. `test.failing` asserts the
	// desired behaviour (position preserved) and therefore documents the bug
	// while keeping CI green; it will flip red once the behaviour is fixed.
	test.failing("BUG: full scrollback + streaming output drags a scrolled-up viewport to the top", async () => {
		const scrollback = 50;
		const rows = 10;
		const term = new Terminal({ cols: 80, rows, scrollback });

		// Overfill so the scrollback buffer is completely full, matching a
		// long-running session.
		await write(term, makeLines(0, 200));
		const baseY = term.buffer.active.baseY;
		expect(baseY).toBe(scrollback);

		// User scrolls up to read something a few screens back.
		const userPosition = 20;
		term.scrollToLine(userPosition);
		expect(term.buffer.active.viewportY).toBe(userPosition);

		// Claude writes new output. Because the buffer is full, every new
		// line trims one old line and xterm decrements the scroll offset.
		await write(term, makeLines(200, 260));

		// EXPECTED (what the user wants): their scroll position is not
		// forcibly moved just because output arrived.
		// ACTUAL (the bug): viewportY has been dragged down to 0 (top).
		expect(term.buffer.active.viewportY).toBe(userPosition);
	});
});
