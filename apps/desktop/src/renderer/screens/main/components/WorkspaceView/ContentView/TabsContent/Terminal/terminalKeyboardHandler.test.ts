/**
 * Reproduction tests for issue #3942:
 * "Shift + enter doesn't start a new line in Codex anymore"
 *
 * The v1 terminal keyboard handler unconditionally intercepts Shift+Enter
 * and rewrites it to ESC+CR (\x1b\r) so Claude Code's TUI sees Alt+Enter
 * instead of the literal "\" the shell would otherwise echo. The override
 * runs before xterm's kitty keyboard encoding, so the kitty CSI-u sequence
 * (\x1b[13;2u) that Codex's Ink-based TUI listens for never reaches the
 * pty. As a result, Shift+Enter in a Codex pane no longer inserts a newline.
 *
 * Fix: keep the ESC+CR override gated on `onShiftEnter` being supplied. The
 * lifecycle hook only supplies it when the pane is not running Codex, so for
 * Codex panes the handler returns true and xterm forwards the kitty-encoded
 * Shift+Enter the TUI expects.
 */
import { describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";

// Mock the hotkeys module — its index re-exports React hooks and zustand
// stores that pull in trpc-electron, which throws during test collection.
mock.module("renderer/hotkeys", () => ({
	resolveHotkeyFromEvent: () => null,
}));

const { setupKeyboardHandler } = await import("./terminalKeyboardHandler");

type CapturedHandler = (event: KeyboardEvent) => boolean;

function makeFakeXterm(): {
	xterm: XTerm;
	getHandler: () => CapturedHandler;
} {
	let attached: CapturedHandler = () => true;
	const xterm = {
		attachCustomKeyEventHandler: (handler: CapturedHandler) => {
			attached = handler;
		},
		hasSelection: () => false,
		selectAll: () => {},
	} as unknown as XTerm;
	return { xterm, getHandler: () => attached };
}

function makeKeyEvent(
	type: "keydown" | "keyup",
	overrides: Partial<{
		key: string;
		shiftKey: boolean;
		metaKey: boolean;
		ctrlKey: boolean;
		altKey: boolean;
	}> = {},
): KeyboardEvent {
	const event = {
		type,
		key: "Enter",
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		preventDefault: () => {},
		stopPropagation: () => {},
		...overrides,
	};
	return event as unknown as KeyboardEvent;
}

function shiftEnterEvent(): KeyboardEvent {
	return makeKeyEvent("keydown", { key: "Enter", shiftKey: true });
}

describe("setupKeyboardHandler — Shift+Enter (issue #3942)", () => {
	it("calls onShiftEnter and suppresses xterm when override is provided (Claude Code path)", () => {
		const { xterm, getHandler } = makeFakeXterm();
		let invocations = 0;
		setupKeyboardHandler(xterm, {
			onShiftEnter: () => {
				invocations += 1;
			},
		});

		const result = getHandler()(shiftEnterEvent());

		expect(invocations).toBe(1);
		expect(result).toBe(false);
	});

	it("does NOT intercept Shift+Enter when onShiftEnter is omitted, so xterm's kitty keyboard encoding reaches the pty (Codex path)", () => {
		const { xterm, getHandler } = makeFakeXterm();
		setupKeyboardHandler(xterm, {});

		const result = getHandler()(shiftEnterEvent());

		// Returning true lets xterm process the key normally — with
		// `vtExtensions: { kittyKeyboard: true }` enabled in the terminal
		// options, xterm encodes Shift+Enter as the CSI-u sequence
		// `\x1b[13;2u`, which Codex's Ink TUI handles as a newline.
		expect(result).toBe(true);
	});

	it("does not call onShiftEnter on keyup (only keydown should fire)", () => {
		const { xterm, getHandler } = makeFakeXterm();
		let invocations = 0;
		setupKeyboardHandler(xterm, {
			onShiftEnter: () => {
				invocations += 1;
			},
		});

		const keyup = makeKeyEvent("keyup", { key: "Enter", shiftKey: true });
		getHandler()(keyup);
		expect(invocations).toBe(0);
	});
});
