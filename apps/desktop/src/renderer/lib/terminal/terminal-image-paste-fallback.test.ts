import { describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	handleImagePasteFallback,
	installImagePasteFallback,
	isImageFilePaste,
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

// Chromium puts a MIME type on every file clipboard entry; the fake payloads
// carry one so the image/non-image branch is exercised for real.
const imageFile = (name = "shot.png") => ({ name, type: "image/png" });
const pdfFile = (name = "notes.pdf") => ({ name, type: "application/pdf" });

function makeFakeTerminal() {
	const input = mock(() => {});
	const paste = mock((_text: string) => {});
	return {
		terminal: { input, paste } as unknown as XTerm,
		input,
		paste,
	};
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
			files: [imageFile()],
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
			files: [imageFile()],
		});
		const { terminal, input } = makeFakeTerminal();

		handleImagePasteFallback(event, terminal);

		expect(input).not.toHaveBeenCalled();
		expect(flags.defaultPrevented).toBe(false);
		expect(flags.immediateStopped).toBe(false);
	});

	it("routes the clipboard files to the override instead of forwarding ^V", () => {
		// Remote workspaces: the TUI's machine has no access to the local
		// clipboard, so the override ships the bytes over and pastes a path.
		const fileA = imageFile("image.png");
		const fileB = imageFile("second.png");
		const { event, flags } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [fileA, fileB],
		});
		const { terminal, input } = makeFakeTerminal();
		const override = mock((_files: File[]) => {});

		handleImagePasteFallback(event, terminal, () => override);

		expect(input).not.toHaveBeenCalled();
		expect(override).toHaveBeenCalledTimes(1);
		expect(override.mock.calls[0]?.[0]).toEqual([
			fileA,
			fileB,
		] as unknown as File[]);
		expect(flags.defaultPrevented).toBe(true);
		expect(flags.immediateStopped).toBe(true);
	});

	it("forwards ^V when the override getter returns null", () => {
		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [imageFile()],
		});
		const { terminal, input } = makeFakeTerminal();

		handleImagePasteFallback(event, terminal, () => null);

		expect(input).toHaveBeenCalledWith("\x16", true);
	});

	it("does not consult the override for text paste", () => {
		const { event } = clipboardEvent({
			types: ["text/plain"],
			getData: (t) => (t === "text/plain" ? "hello" : ""),
		});
		const { terminal, input } = makeFakeTerminal();
		const override = mock((_files: File[]) => {});

		handleImagePasteFallback(event, terminal, () => override);

		expect(override).not.toHaveBeenCalled();
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

	it("registered handler forwards Ctrl+V on file paste", () => {
		const { wrapper, handlers } = makeFakeWrapper();
		const { terminal, input } = makeFakeTerminal();
		installImagePasteFallback(terminal, wrapper);

		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [imageFile()],
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

describe("isImageFilePaste", () => {
	it("accepts an image payload", () => {
		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [imageFile()],
		});
		expect(isImageFilePaste(event)).toBe(true);
	});

	it("rejects a document payload Chromium describes the same way", () => {
		// Both arrive as a File entry with no text/plain; only the MIME type
		// separates the screenshot from the PDF.
		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [pdfFile()],
		});
		expect(isImageFilePaste(event)).toBe(false);
	});

	it("rejects a mixed payload, because the image path is all-or-nothing", () => {
		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [imageFile(), pdfFile()],
		});
		expect(isImageFilePaste(event)).toBe(false);
	});

	it("rejects an image next to a file whose type the browser could not tell", () => {
		// `File.type` is empty when the browser cannot determine the MIME type
		// (w3.org), and dropping those entries first made this payload read as
		// "all images" — the unknown file was filtered out, `every()` then held,
		// and the pair took the image path (override, or `^V` to the TUI) instead
		// of pasting both paths. An unconfirmed type is not an image.
		const { event } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [imageFile(), { name: "mystery", type: "" }],
		});
		expect(isImageFilePaste(event)).toBe(false);
	});
});

describe("pasting a file that is not an image", () => {
	it("pastes the path instead of signalling the TUI to attach an image", () => {
		// #7904: a copied document took the image path, so Claude Code attached
		// it as a picture and the path the user wanted never arrived.
		const { event, flags } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [pdfFile("contract.pdf")],
		});
		const { terminal, input, paste } = makeFakeTerminal();

		handleImagePasteFallback(event, terminal);

		expect(input).not.toHaveBeenCalled();
		expect(paste).toHaveBeenCalledWith("contract.pdf");
		expect(flags.defaultPrevented).toBe(true);
		expect(flags.immediateStopped).toBe(true);
	});

	it("routes a remote document through the override instead of pasting a local path", () => {
		// A sandbox or relay-reached PTY cannot read a local path, so a
		// document in a remote workspace ships its bytes through the override,
		// exactly like an image paste does (#7904 review).
		const { event, flags } = clipboardEvent({
			types: ["Files"],
			getData: () => "",
			files: [pdfFile("contract.pdf")],
		});
		const { terminal, paste } = makeFakeTerminal();
		const override = mock((_files: File[]) => {});

		handleImagePasteFallback(event, terminal, () => override);

		expect(override).toHaveBeenCalled();
		expect(paste).not.toHaveBeenCalled();
		expect(flags.defaultPrevented).toBe(true);
		expect(flags.immediateStopped).toBe(true);
	});

	it("resolves a pasted file's absolute path through webUtils.getPathForFile", () => {
		// The headline path-resolution branch (webUtils.getPathForFile) is the
		// reason a document pastes its real absolute path, not its basename, yet
		// no case stubbed the resolver let every paste go through file.name. A
		// regression that pastes the basename would otherwise pass all suites.
		const hadWindow = Boolean((globalThis as any).window);
		const existingWebUtils = (globalThis as any).window?.webUtils;
		const getPathForFile = mock(
			() => "/Users/alice/Downloads/annual report.pdf",
		);
		if (!hadWindow) (globalThis as any).window = {};
		(globalThis as any).window.webUtils = { getPathForFile };
		try {
			const { event } = clipboardEvent({
				types: ["Files"],
				getData: () => "",
				files: [pdfFile("annual report.pdf")],
			});
			const { terminal, paste } = makeFakeTerminal();

			handleImagePasteFallback(event, terminal);

			expect(getPathForFile).toHaveBeenCalled();
			expect(paste).toHaveBeenCalledWith(
				"'/Users/alice/Downloads/annual report.pdf'",
			);
		} finally {
			// The stub must not leak: `window` itself is only deleted when this
			// case created it, otherwise a later suite would observe a phantom
			// global that the code checks for existence.
			if (!hadWindow) {
				delete (globalThis as any).window;
			} else if (existingWebUtils) {
				(globalThis as any).window.webUtils = existingWebUtils;
			} else {
				delete (globalThis as any).window.webUtils;
			}
		}
	});

	it("quotes a path a shell would split, and leaves a plain one untouched", () => {
		// #7904 review: `/Users/alice/Downloads/annual report.pdf` pasted
		// unquoted became two arguments, so `cat ` opened neither file. Only the
		// paths that need it are quoted — the ordinary single-word case must stay
		// byte-for-byte what it was, since it is also what a TUI reads as an
		// attachment mention.
		const cases: [string, string][] = [
			["notes.pdf", "notes.pdf"],
			[
				"/Users/alice/Downloads/annual report.pdf",
				"'/Users/alice/Downloads/annual report.pdf'",
			],
			["it's mine.pdf", "'it'\\''s mine.pdf'"],
		];

		for (const [name, expected] of cases) {
			const { event } = clipboardEvent({
				types: ["Files"],
				getData: () => "",
				files: [pdfFile(name)],
			});
			const { terminal, paste } = makeFakeTerminal();

			handleImagePasteFallback(event, terminal);

			expect(paste).toHaveBeenCalledWith(expected);
		}
	});
});
