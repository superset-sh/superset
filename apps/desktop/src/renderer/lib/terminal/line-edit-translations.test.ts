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

	it("maps Shift+Enter to the TUI newline sequence on Mac", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", shiftKey: true }), {
				isMac: true,
				isWindows: false,
			}),
		).toBe("\x1b\r");
	});

	it("maps Shift+Enter to the TUI newline sequence on Windows", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", shiftKey: true }), {
				isMac: false,
				isWindows: true,
			}),
		).toBe("\x1b\r");
	});

	it("maps Shift+Enter to the TUI newline sequence on Linux", () => {
		expect(
			translateLineEditChord(event({ key: "Enter", shiftKey: true }), {
				isMac: false,
				isWindows: false,
			}),
		).toBe("\x1b\r");
	});

	it("does not map plain Enter", () => {
		expect(
			translateLineEditChord(event({ key: "Enter" }), {
				isMac: true,
				isWindows: false,
			}),
		).toBeNull();
	});
});
