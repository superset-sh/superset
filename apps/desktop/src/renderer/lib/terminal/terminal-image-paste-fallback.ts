import type { Terminal as XTerm } from "@xterm/xterm";

// For file/image clipboard payloads (screenshot, copied file, web image),
// xterm.js's built-in paste handler reads an empty string from
// `clipboardData.getData("text/plain")` and still emits empty bracketed-paste
// markers (`\x1b[200~\x1b[201~`). TUIs that key off `^V` to attach the image
// (Codex, Claude Code, opencode) never see the signal.
//
// Forward `\x16` (Ctrl+V) instead, mirroring iTerm's "Paste or send ^V".
// Restores the fallback that was removed alongside the rest of
// `setupPasteHandler` in #3582.
//
// Trigger only on `data.files.length > 0` (W3C `DataTransfer.files`):
// Chromium synthesizes a File entry for any image/file clipboard payload, so
// this matches Codex's `arboard.file_list()` primary path. A broader
// "any non-text/plain MIME" heuristic over-fires on `text/html`-only
// clipboards and triggers a "Failed to paste image" error toast in Codex.
//
// Capture phase on the wrapper runs before xterm's textarea/element paste
// listeners, so `stopImmediatePropagation` cleanly preempts the bracketed-paste
// wrap.

/**
 * Replaces the Ctrl+V forward for terminals whose PTY runs on another machine
 * (relay-reached host, cloud sandbox): the TUI over there reads *its own* OS
 * clipboard, which never holds the user's local screenshot. The override
 * receives the clipboard's File entries so the caller can ship the bytes to
 * the workspace and paste a path instead.
 */
export type ImagePasteOverride = (files: File[]) => void;

export function isNonTextPaste(event: ClipboardEvent): boolean {
	const data = event.clipboardData;
	if (!data) return false;
	if (data.getData("text/plain")) return false;
	return (data.files?.length ?? 0) > 0;
}

export function handleImagePasteFallback(
	event: ClipboardEvent,
	terminal: XTerm,
	getOverride?: () => ImagePasteOverride | null,
): void {
	if (!isNonTextPaste(event)) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	const override = getOverride?.() ?? null;
	if (override) {
		// File handles stay readable after dispatch; the list itself doesn't.
		override(Array.from(event.clipboardData?.files ?? []));
		return;
	}
	terminal.input("\x16", true);
}

export function installImagePasteFallback(
	terminal: XTerm,
	wrapper: HTMLElement,
	getOverride?: () => ImagePasteOverride | null,
): () => void {
	const handler = (event: ClipboardEvent) => {
		handleImagePasteFallback(event, terminal, getOverride);
	};

	wrapper.addEventListener("paste", handler, { capture: true });
	return () => {
		wrapper.removeEventListener("paste", handler, { capture: true });
	};
}
