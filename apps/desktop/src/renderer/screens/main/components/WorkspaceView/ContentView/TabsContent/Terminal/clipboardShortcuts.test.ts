import { describe, expect, it } from "bun:test";
import { shouldBubbleClipboardShortcut } from "./clipboardShortcuts";

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
	it("matches VS Code macOS terminal paste", () => {
		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyV", metaKey: true }),
				{
					isMac: true,
					isWindows: false,
					hasSelection: false,
				},
			),
		).toBe(true);
	});

	it("matches VS Code macOS terminal copy only when selection exists", () => {
		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyC", metaKey: true }),
				{
					isMac: true,
					isWindows: false,
					hasSelection: true,
				},
			),
		).toBe(true);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyC", metaKey: true }),
				{
					isMac: true,
					isWindows: false,
					hasSelection: false,
				},
			),
		).toBe(false);
	});

	it("matches VS Code Windows terminal copy and paste bindings", () => {
		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyV", ctrlKey: true }),
				{
					isMac: false,
					isWindows: true,
					hasSelection: false,
				},
			),
		).toBe(true);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
				{
					isMac: false,
					isWindows: true,
					hasSelection: false,
				},
			),
		).toBe(true);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyC", ctrlKey: true }),
				{
					isMac: false,
					isWindows: true,
					hasSelection: true,
				},
			),
		).toBe(true);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyC", ctrlKey: true, shiftKey: true }),
				{
					isMac: false,
					isWindows: true,
					hasSelection: true,
				},
			),
		).toBe(true);
	});

	it("keeps Windows Ctrl+C going to the PTY when nothing is selected", () => {
		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyC", ctrlKey: true }),
				{
					isMac: false,
					isWindows: true,
					hasSelection: false,
				},
			),
		).toBe(false);
	});

	it("matches VS Code Linux terminal copy and paste bindings", () => {
		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyC", ctrlKey: true, shiftKey: true }),
				{
					isMac: false,
					isWindows: false,
					hasSelection: true,
				},
			),
		).toBe(true);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyV", ctrlKey: true, shiftKey: true }),
				{
					isMac: false,
					isWindows: false,
					hasSelection: false,
				},
			),
		).toBe(true);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "Insert", shiftKey: true }),
				{
					isMac: false,
					isWindows: false,
					hasSelection: false,
				},
			),
		).toBe(true);
	});

	it("does not widen clipboard bubbling beyond VS Code's bindings", () => {
		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyA", metaKey: true }),
				{
					isMac: true,
					isWindows: false,
					hasSelection: true,
				},
			),
		).toBe(false);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "KeyV", ctrlKey: true }),
				{
					isMac: false,
					isWindows: false,
					hasSelection: false,
				},
			),
		).toBe(false);

		expect(
			shouldBubbleClipboardShortcut(
				makeEvent({ code: "Insert", ctrlKey: true }),
				{
					isMac: false,
					isWindows: false,
					hasSelection: false,
				},
			),
		).toBe(false);
	});
});
