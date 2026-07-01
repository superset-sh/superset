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

describe("translateLineEditChord", () => {
	it("maps Mac Cmd+Enter to the TUI newline sequence", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", metaKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x1b\r");
	});

	// Repro for #4924: Cmd+Backspace previously sent "\x15\x1b[D" (Ctrl+U +
	// Escape-Left). The trailing left-arrow detaches Claude Code's agent view
	// when the input is empty. macOS Cmd+Backspace should only clear to the
	// start of the line (Ctrl+U / \x15) and leave the cursor where it is.
	it("maps Mac Cmd+Backspace to Ctrl+U with no trailing arrow", () => {
		expect(
			translateLineEditChord(event({ key: "Backspace", metaKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x15");
	});

	it("does not map Cmd+Shift+Enter", () => {
		expect(
			translateLineEditChord(
				event({ key: "Enter", metaKey: true, shiftKey: true }),
				{ isMac: true, isWindows: false },
			),
		).toBeNull();
	});

	it("does not map Enter on non-Mac platforms", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", metaKey: true }), {
				isMac: false,
				isWindows: true,
			}),
		).toBeNull();
	});
});
