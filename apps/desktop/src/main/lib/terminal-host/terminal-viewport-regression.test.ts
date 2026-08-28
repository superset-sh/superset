/**
 * Viewport regression guard for the Pi scroll jump.
 *
 * Pi redraws with a synchronized update that ends in ED3 (`CSI 3 J`, erase
 * scrollback). Through @xterm/xterm 6.1.0-beta.289 that path trimmed the
 * scrollback and clamped ydisp but left `isUserScrolling` armed, so the
 * viewport stayed frozen where the user had scrolled to and never followed
 * subsequent output again. beta.302 clears the flag, scoped to the normal
 * buffer.
 */

import { expect, test } from "bun:test";
import "../../terminal-host/xterm-env-polyfill";
import { Terminal } from "@xterm/headless";

const CSI = "\x1b[";
const ERASE_SCROLLBACK = `${CSI}3J`;
const ENTER_ALT_SCREEN = `${CSI}?1049h`;
const EXIT_ALT_SCREEN = `${CSI}?1049l`;
// Pi's full redraw: begin synchronized update, clear, home, erase scrollback.
const PI_REDRAW = `${CSI}?2026h${CSI}2J${CSI}H${ERASE_SCROLLBACK}redrawn${CSI}?2026l`;

function write(terminal: Terminal, data: string): Promise<void> {
	return new Promise((resolve) => terminal.write(data, resolve));
}

function lines(prefix: string, count: number): string {
	return Array.from({ length: count }, (_, i) => `${prefix} ${i}\r\n`).join("");
}

function newTerminal(): Terminal {
	return new Terminal({ cols: 20, rows: 5, scrollback: 100 });
}

test("viewport follows new output after Pi erases the scrollback", async () => {
	const terminal = newTerminal();

	try {
		await write(terminal, lines("line", 40));
		terminal.scrollLines(-15);
		expect(terminal.buffer.active.viewportY).toBeLessThan(
			terminal.buffer.active.baseY,
		);

		await write(terminal, PI_REDRAW);
		await write(terminal, lines("after", 20));

		// Before beta.302 the viewport stayed pinned at 0 while baseY advanced.
		expect(terminal.buffer.active.viewportY).toBe(terminal.buffer.active.baseY);
	} finally {
		terminal.dispose();
	}
});

test("ED3 on the alt screen leaves the normal buffer's scroll position alone", async () => {
	const terminal = newTerminal();

	try {
		await write(terminal, lines("line", 40));
		terminal.scrollLines(-15);
		const scrolledTo = terminal.buffer.active.viewportY;

		await write(
			terminal,
			`${ENTER_ALT_SCREEN}${ERASE_SCROLLBACK}${EXIT_ALT_SCREEN}`,
		);
		await write(terminal, "more\r\n");

		// The flag tracks the normal buffer, so an alt-screen ED3 must not clear
		// it and yank the user back to the bottom.
		expect(terminal.buffer.active.viewportY).toBe(scrolledTo);
		expect(terminal.buffer.active.viewportY).toBeLessThan(
			terminal.buffer.active.baseY,
		);
	} finally {
		terminal.dispose();
	}
});
