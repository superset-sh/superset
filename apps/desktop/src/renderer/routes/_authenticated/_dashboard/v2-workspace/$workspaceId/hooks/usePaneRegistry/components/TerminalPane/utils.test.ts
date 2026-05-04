import { describe, expect, mock, test } from "bun:test";
import { handleClipboardPaste } from "./utils";

function makeClipboard(textPlain: string | null): DataTransfer | null {
	if (textPlain === null) return null;
	return {
		getData: (type: string) => (type === "text/plain" ? textPlain : ""),
	} as unknown as DataTransfer;
}

describe("handleClipboardPaste", () => {
	// Reproduces issue #4029: paste events on the v2 workspace terminal must
	// forward clipboard text to the PTY. Without an explicit bridge,
	// pasted text never reaches the terminal when xterm's internal paste
	// listener doesn't fire (e.g. focus on container, not textarea).
	test("forwards pasted text to the terminal sink", () => {
		const paste = mock();
		const preventDefault = mock();

		const handled = handleClipboardPaste(
			{ clipboardData: makeClipboard("echo hello"), preventDefault },
			{ isClosed: () => false, paste },
		);

		expect(handled).toBe(true);
		expect(paste).toHaveBeenCalledWith("echo hello");
		expect(preventDefault).toHaveBeenCalledTimes(1);
	});

	test("preserves multi-line pasted content verbatim (bracketed-paste relies on it)", () => {
		const paste = mock();
		const preventDefault = mock();
		const multiLine = "ls -la\nwhoami\necho done";

		handleClipboardPaste(
			{ clipboardData: makeClipboard(multiLine), preventDefault },
			{ isClosed: () => false, paste },
		);

		expect(paste).toHaveBeenCalledWith(multiLine);
	});

	test("ignores paste when the WebSocket transport is closed", () => {
		const paste = mock();
		const preventDefault = mock();

		const handled = handleClipboardPaste(
			{ clipboardData: makeClipboard("echo hello"), preventDefault },
			{ isClosed: () => true, paste },
		);

		expect(handled).toBe(false);
		expect(paste).not.toHaveBeenCalled();
		expect(preventDefault).not.toHaveBeenCalled();
	});

	test("ignores events with no clipboardData (Linux/Wayland Electron quirk)", () => {
		const paste = mock();
		const preventDefault = mock();

		const handled = handleClipboardPaste(
			{ clipboardData: null, preventDefault },
			{ isClosed: () => false, paste },
		);

		expect(handled).toBe(false);
		expect(paste).not.toHaveBeenCalled();
		expect(preventDefault).not.toHaveBeenCalled();
	});

	test("ignores empty clipboard text without consuming the event", () => {
		const paste = mock();
		const preventDefault = mock();

		const handled = handleClipboardPaste(
			{ clipboardData: makeClipboard(""), preventDefault },
			{ isClosed: () => false, paste },
		);

		expect(handled).toBe(false);
		expect(paste).not.toHaveBeenCalled();
		// preventDefault must not fire — we want the browser/xterm to keep handling
		// any non-text payloads (e.g. images) we don't know how to forward.
		expect(preventDefault).not.toHaveBeenCalled();
	});
});
