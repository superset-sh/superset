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
});
