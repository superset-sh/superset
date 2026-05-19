import { describe, expect, it } from "bun:test";
import { translateLineEditChord } from "./line-edit-translations";

function event(overrides: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		key: "",
		metaKey: false,
		altKey: false,
		ctrlKey: false,
		shiftKey: false,
		...overrides,
	} as KeyboardEvent;
}

const noKitty = { kittyKeyboardActive: false };

describe("translateLineEditChord", () => {
	it("maps Mac Cmd+Enter to the TUI newline sequence", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", metaKey: true }), {
				isMac: true,
				isWindows: false,
				...noKitty,
			}),
		).toBe("\x1b\r");
	});

	it("does not map Cmd+Shift+Enter", () => {
		expect(
			translateLineEditChord(
				event({ key: "Enter", metaKey: true, shiftKey: true }),
				{ isMac: true, isWindows: false, ...noKitty },
			),
		).toBeNull();
	});

	it("does not map Enter on non-Mac platforms", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", metaKey: true }), {
				isMac: false,
				isWindows: true,
				...noKitty,
			}),
		).toBeNull();
	});

	it("maps Shift+Enter to the TUI newline sequence on Mac", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", shiftKey: true }), {
				isMac: true,
				isWindows: false,
				...noKitty,
			}),
		).toBe("\x1b\r");
	});

	it("maps Shift+Enter to the TUI newline sequence on Windows", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", shiftKey: true }), {
				isMac: false,
				isWindows: true,
				...noKitty,
			}),
		).toBe("\x1b\r");
	});

	it("maps Shift+Enter to the TUI newline sequence on Linux", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", shiftKey: true }), {
				isMac: false,
				isWindows: false,
				...noKitty,
			}),
		).toBe("\x1b\r");
	});

	it("skips Shift+Enter when kitty keyboard mode is active", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", shiftKey: true }), {
				isMac: true,
				isWindows: false,
				kittyKeyboardActive: true,
			}),
		).toBeNull();
	});

	it("skips Mac Cmd+Enter when kitty keyboard mode is active", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", metaKey: true }), {
				isMac: true,
				isWindows: false,
				kittyKeyboardActive: true,
			}),
		).toBeNull();
	});

	it("still translates Cmd+Backspace when kitty keyboard mode is active", () => {
		expect(
			translateLineEditChord(event({ key: "Backspace", metaKey: true }), {
				isMac: true,
				isWindows: false,
				kittyKeyboardActive: true,
			}),
		).toBe("\x15\x1b[D");
	});
});
