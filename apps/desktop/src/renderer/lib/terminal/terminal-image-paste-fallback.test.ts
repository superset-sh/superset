import { describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	handleImagePasteFallback,
	installImagePasteFallback,
	isNonTextPaste,
} from "./terminal-image-paste-fallback";

interface FakeClipboardData {
	types: readonly string[];
	getData: (type: string) => string;
	files?: { length: number };
}

function clipboardEvent(data: FakeClipboardData) {
	const flags = { defaultPrevented: false, immediateStopped: false };
	const event = {
		type: "paste",
		clipboardData: { files: { length: 0 }, ...data },
		preventDefault() {
			flags.defaultPrevented = true;
		},
		stopImmediatePropagation() {
			flags.immediateStopped = true;
		},
	} as unknown as ClipboardEvent;
	return { event, flags };
}

function makeFakeTerminal() {
	const input = mock(() => {});
	return { terminal: { input } as unknown as XTerm, input };
}

describe("isNonTextPaste", () => {
	it("returns true when files are present (screenshot, copied file, web image)", () => {
		// Chromium synthesizes a File entry for any image/file clipboard payload,
		// so files.length is the universal signal across all source types
		// (Cmd+Shift+Ctrl+4, Finder copy, right-click Copy Image, drag-drop).
		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: { length: 1 },
		});
		expect(isNonTextPaste(event)).toBe(true);
	});

	it("returns false when text/plain has content", () => {
		const { event } = clipboardEvent({
			types: ["text/plain"],
			getData: (t) => (t === "text/plain" ? "hello" : ""),
		});
		expect(isNonTextPaste(event)).toBe(false);
	});

	it("returns false when text/plain has content alongside image", () => {
		// Mixed payloads (e.g. image with alt text, labeled file URL) prefer
		// the text path so users can still paste URLs into the shell.
		const { event } = clipboardEvent({
			types: ["text/plain", "image/png"],
			getData: (t) => (t === "text/plain" ? "url" : ""),
			files: { length: 1 },
		});
		expect(isNonTextPaste(event)).toBe(false);
	});

	it("returns false when only text/plain is present but empty", () => {
		const { event } = clipboardEvent({
			types: ["text/plain"],
			getData: () => "",
		});
		expect(isNonTextPaste(event)).toBe(false);
	});

	it("returns false for text/html-only rich text (no file payload)", () => {
		// Rare edge case: some rich-text editors put only text/html on the
		// clipboard. The TUI's clipboard reader will find no image, so firing
		// ^V would surface a "Failed to paste image" error in Codex.
		const { event } = clipboardEvent({
			types: ["text/html"],
			getData: () => "",
		});
		expect(isNonTextPaste(event)).toBe(false);
	});

	it("returns false when types lists image but no File entry exists", () => {
		// Synthetic case (e.g. setData("image/png", "...")) — no real file
		// to attach, the TUI's OS-clipboard read will fail.
		const { event } = clipboardEvent({
			types: ["image/png"],
			getData: () => "",
		});
		expect(isNonTextPaste(event)).toBe(false);
	});

	it("returns false when clipboard is empty", () => {
		const { event } = clipboardEvent({ types: [], getData: () => "" });
		expect(isNonTextPaste(event)).toBe(false);
	});
});

describe("handleImagePasteFallback", () => {
	it("forwards Ctrl+V (\\x16) when clipboard has files but no text", () => {
		const { event, flags } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: { length: 1 },
		});
		const { terminal, input } = makeFakeTerminal();

		handleImagePasteFallback(event, terminal);

		expect(input).toHaveBeenCalledTimes(1);
		expect(input).toHaveBeenCalledWith("\x16", true);
		expect(flags.defaultPrevented).toBe(true);
		expect(flags.immediateStopped).toBe(true);
	});

	it("does not call terminal.input for text paste — xterm's built-in handles it", () => {
		const { event, flags } = clipboardEvent({
			types: ["text/plain"],
			getData: (t) => (t === "text/plain" ? "hello" : ""),
		});
		const { terminal, input } = makeFakeTerminal();

		handleImagePasteFallback(event, terminal);

		expect(input).not.toHaveBeenCalled();
		expect(flags.defaultPrevented).toBe(false);
		expect(flags.immediateStopped).toBe(false);
	});

	it("does not call terminal.input for mixed text+image paste", () => {
		const { event, flags } = clipboardEvent({
			types: ["text/plain", "image/png"],
			getData: (t) => (t === "text/plain" ? "url-as-text" : ""),
			files: { length: 1 },
		});
		const { terminal, input } = makeFakeTerminal();

		handleImagePasteFallback(event, terminal);

		expect(input).not.toHaveBeenCalled();
		expect(flags.defaultPrevented).toBe(false);
		expect(flags.immediateStopped).toBe(false);
	});
});

describe("installImagePasteFallback", () => {
	function makeFakeWrapper() {
		const handlers: Array<{
			type: string;
			handler: EventListener;
			options: AddEventListenerOptions | boolean | undefined;
		}> = [];
		const wrapper = {
			addEventListener: mock(
				(
					type: string,
					handler: EventListener,
					options?: AddEventListenerOptions | boolean,
				) => {
					handlers.push({ type, handler, options });
				},
			),
			removeEventListener: mock(
				(
					type: string,
					handler: EventListener,
					options?: AddEventListenerOptions | boolean,
				) => {
					const idx = handlers.findIndex(
						(h) =>
							h.type === type &&
							h.handler === handler &&
							JSON.stringify(h.options) === JSON.stringify(options),
					);
					if (idx >= 0) handlers.splice(idx, 1);
				},
			),
		};
		return { wrapper: wrapper as unknown as HTMLElement, handlers };
	}

	it("registers a capture-phase paste listener on the wrapper", () => {
		const { wrapper, handlers } = makeFakeWrapper();
		const { terminal } = makeFakeTerminal();

		installImagePasteFallback(terminal, wrapper);

		expect(handlers).toHaveLength(1);
		expect(handlers[0]?.type).toBe("paste");
		expect(handlers[0]?.options).toEqual({ capture: true });
	});

	it("dispose removes the listener with matching capture option", () => {
		// Regression guard: removeEventListener silently no-ops if `capture`
		// doesn't match the registration. A leaked listener would survive
		// terminal disposal and fire on a stale runtime.
		const { wrapper, handlers } = makeFakeWrapper();
		const { terminal } = makeFakeTerminal();

		const dispose = installImagePasteFallback(terminal, wrapper);
		expect(handlers).toHaveLength(1);
		dispose();
		expect(handlers).toHaveLength(0);
	});

	it("registered handler forwards Ctrl+V on file paste", () => {
		const { wrapper, handlers } = makeFakeWrapper();
		const { terminal, input } = makeFakeTerminal();
		installImagePasteFallback(terminal, wrapper);

		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: { length: 1 },
		});
		handlers[0]?.handler(event);

		expect(input).toHaveBeenCalledWith("\x16", true);
	});

	it("registered handler ignores text paste", () => {
		const { wrapper, handlers } = makeFakeWrapper();
		const { terminal, input } = makeFakeTerminal();
		installImagePasteFallback(terminal, wrapper);

		const { event } = clipboardEvent({
			types: ["text/plain"],
			getData: (t) => (t === "text/plain" ? "hello" : ""),
		});
		handlers[0]?.handler(event);

		expect(input).not.toHaveBeenCalled();
	});
});
