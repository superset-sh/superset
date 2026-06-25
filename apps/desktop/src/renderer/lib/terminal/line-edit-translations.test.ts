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

	it("Cmd+Enter translation is independent of TERM_PROGRAM", () => {
		// This test verifies that Cmd+Enter newline handling works via xterm's
		// custom key event handler (translateLineEditChord), which is independent
		// of the TERM_PROGRAM environment variable. This ensures that changing
		// TERM_PROGRAM from "kitty" to "superset" (to prevent Claude Code from
		// enabling the full kitty keyboard protocol) does not break Cmd+Enter
		// newline functionality in chat TUIs.
		const result = translateLineEditChord(
			event({ key: "Enter", metaKey: true }),
			{ isMac: true, isWindows: false },
		);
		expect(result).toBe("\x1b\r");
	});

	it("maps Mac Cmd+Backspace to delete-word-left sequence", () => {
		expect(
			translateLineEditChord(event({ key: "Backspace", metaKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x15\x1b[D");
	});

	it("maps Mac Cmd+ArrowLeft to move-to-start-of-line", () => {
		expect(
			translateLineEditChord(event({ key: "ArrowLeft", metaKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x01");
	});

	it("maps Mac Cmd+ArrowRight to move-to-end-of-line", () => {
		expect(
			translateLineEditChord(event({ key: "ArrowRight", metaKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x05");
	});

	it("maps Mac Alt+ArrowLeft to backward-word", () => {
		expect(
			translateLineEditChord(event({ key: "ArrowLeft", altKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x1bb");
	});

	it("maps Mac Alt+ArrowRight to forward-word", () => {
		expect(
			translateLineEditChord(event({ key: "ArrowRight", altKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x1bf");
	});

	it("maps Windows Ctrl+ArrowLeft to backward-word", () => {
		expect(
			translateLineEditChord(event({ key: "ArrowLeft", ctrlKey: true }), {
				isMac: false,
				isWindows: true,
			}),
		).toBe("\x1bb");
	});

	it("maps Windows Ctrl+ArrowRight to forward-word", () => {
		expect(
			translateLineEditChord(event({ key: "ArrowRight", ctrlKey: true }), {
				isMac: false,
				isWindows: true,
			}),
		).toBe("\x1bf");
	});
});
