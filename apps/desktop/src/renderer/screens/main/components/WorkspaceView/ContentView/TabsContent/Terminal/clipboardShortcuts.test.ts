import { describe, expect, it } from "bun:test";
import {
	shouldBubbleClipboardShortcut,
	shouldSelectAllShortcut,
} from "./clipboardShortcuts";

function makeEvent(
	overrides: Partial<{
		code: string;
		metaKey: boolean;
		ctrlKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
	}>,
) {
	return {
		code: "KeyC",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	};
}

describe("shouldBubbleClipboardShortcut", () => {
	it("matches the VS Code terminal clipboard bindings", () => {
		const cases = [
			{
				name: "macOS Cmd+V",
				event: makeEvent({ code: "KeyV", metaKey: true }),
				options: { isMac: true, isWindows: false, hasSelection: false },
				expected: true,
			},
			{
				name: "macOS Cmd+C with selection",
				event: makeEvent({ code: "KeyC", metaKey: true }),
				options: { isMac: true, isWindows: false, hasSelection: true },
				expected: true,
			},
			{
				name: "windows Ctrl+V",
				event: makeEvent({ code: "KeyV", ctrlKey: true }),
				options: { isMac: false, isWindows: true, hasSelection: false },
				expected: true,
			},
			{
				name: "windows Ctrl+Shift+V",
				event: makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
				options: { isMac: false, isWindows: true, hasSelection: false },
				expected: true,
			},
			{
				name: "windows Ctrl+C with selection",
				event: makeEvent({ code: "KeyC", ctrlKey: true }),
				options: { isMac: false, isWindows: true, hasSelection: true },
				expected: true,
			},
			{
				name: "linux Ctrl+Shift+C with selection",
				event: makeEvent({ code: "KeyC", ctrlKey: true, shiftKey: true }),
				options: { isMac: false, isWindows: false, hasSelection: true },
				expected: true,
			},
			{
				name: "linux Ctrl+Shift+V",
				event: makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
				options: { isMac: false, isWindows: false, hasSelection: false },
				expected: true,
			},
			{
				name: "linux Shift+Insert",
				event: makeEvent({ code: "Insert", shiftKey: true }),
				options: { isMac: false, isWindows: false, hasSelection: false },
				expected: true,
			},
			{
				name: "macOS Cmd+C without selection",
				event: makeEvent({ code: "KeyC", metaKey: true }),
				options: { isMac: true, isWindows: false, hasSelection: false },
				expected: false,
			},
			{
				name: "windows Ctrl+C without selection",
				event: makeEvent({ code: "KeyC", ctrlKey: true }),
				options: { isMac: false, isWindows: true, hasSelection: false },
				expected: false,
			},
			{
				name: "linux Ctrl+Shift+C without selection",
				event: makeEvent({ code: "KeyC", ctrlKey: true, shiftKey: true }),
				options: { isMac: false, isWindows: false, hasSelection: false },
				expected: false,
			},
			{
				name: "linux Ctrl+Insert stays with the PTY",
				event: makeEvent({ code: "Insert", ctrlKey: true }),
				options: { isMac: false, isWindows: false, hasSelection: false },
				expected: false,
			},
			{
				name: "macOS does not inherit linux fallback chords",
				event: makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
				options: { isMac: true, isWindows: false, hasSelection: false },
				expected: false,
			},
			{
				name: "macOS Shift+Insert stays with the PTY",
				event: makeEvent({ code: "Insert", shiftKey: true }),
				options: { isMac: true, isWindows: false, hasSelection: false },
				expected: false,
			},
		];

		for (const { name, event, options, expected } of cases) {
			expect(shouldBubbleClipboardShortcut(event, options), name).toBe(
				expected,
			);
		}
	});
});

describe("shouldSelectAllShortcut", () => {
	it("matches only the VS Code macOS terminal select-all binding", () => {
		const cases = [
			{
				name: "macOS Cmd+A",
				event: makeEvent({ code: "KeyA", metaKey: true }),
				isMac: true,
				expected: true,
			},
			{
				name: "windows Ctrl+A is not intercepted",
				event: makeEvent({ code: "KeyA", ctrlKey: true }),
				isMac: false,
				expected: false,
			},
			{
				name: "macOS Cmd+Shift+A is not intercepted",
				event: makeEvent({ code: "KeyA", metaKey: true, shiftKey: true }),
				isMac: true,
				expected: false,
			},
		];

		for (const { name, event, isMac, expected } of cases) {
			expect(shouldSelectAllShortcut(event, isMac), name).toBe(expected);
		}
	});
});
