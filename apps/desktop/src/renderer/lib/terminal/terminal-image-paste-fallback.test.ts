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
	it("returns true for clipboard with files only", () => {
		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
		});
		expect(isNonTextPaste(event)).toBe(true);
	});

	it("returns true for image MIME types only", () => {
		const { event } = clipboardEvent({
			types: ["image/png"],
			getData: () => "",
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
		const { event } = clipboardEvent({
			types: ["text/plain", "image/png"],
			getData: (t) => (t === "text/plain" ? "url" : ""),
		});
		expect(isNonTextPaste(event)).toBe(false);
	});

	it("returns false when types is empty", () => {
		const { event } = clipboardEvent({ types: [], getData: () => "" });
		expect(isNonTextPaste(event)).toBe(false);
	});

	it("returns true when files is populated but types is empty (browser quirk)", () => {
		const { event } = clipboardEvent({
			types: [],
			getData: () => "",
			files: { length: 1 },
		});
		expect(isNonTextPaste(event)).toBe(true);
	});

	it.each([
		["Files"],
		["image/png"],
		["image/jpeg"],
		["image/gif"],
		["image/webp"],
		["image/svg+xml"],
		["application/x-moz-file"],
		["text/uri-list"],
		["DownloadURL"],
		["text/html"],
	])("returns true for non-text type %j with no text/plain", (type) => {
		const { event } = clipboardEvent({ types: [type], getData: () => "" });
		expect(isNonTextPaste(event)).toBe(true);
	});

	it("returns false when only text/plain is present but empty", () => {
		// Nothing to attach — let xterm emit its empty bracketed paste rather
		// than firing a misleading ^V.
		const { event } = clipboardEvent({
			types: ["text/plain"],
			getData: () => "",
		});
		expect(isNonTextPaste(event)).toBe(false);
	});
});

describe("handleImagePasteFallback", () => {
	it("forwards Ctrl+V (\\x16) when clipboard has files but no text", () => {
		const { event, flags } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
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
		// Mixed payloads (e.g. image with alt text, labeled file URL) prefer
		// the text path so users can still paste URLs into the shell.
		const { event } = clipboardEvent({
			types: ["text/plain", "image/png"],
			getData: (t) => (t === "text/plain" ? "url-as-text" : ""),
		});
		const { terminal, input } = makeFakeTerminal();

		handleImagePasteFallback(event, terminal);

		expect(input).not.toHaveBeenCalled();
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

	it("registered handler forwards Ctrl+V on non-text paste", () => {
		const { wrapper, handlers } = makeFakeWrapper();
		const { terminal, input } = makeFakeTerminal();
		installImagePasteFallback(terminal, wrapper);

		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
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
