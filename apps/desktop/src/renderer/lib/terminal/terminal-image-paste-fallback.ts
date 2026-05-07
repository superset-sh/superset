import type { Terminal as XTerm } from "@xterm/xterm";

// For non-text clipboard payloads (image / file / screenshot), xterm.js's
// built-in paste handler reads an empty string from
// `clipboardData.getData("text/plain")` and still emits empty bracketed-paste
// markers (`\x1b[200~\x1b[201~`). TUIs that key off `^V` to attach the image
// (Codex, Claude Code) never see the signal.
//
// Forward `\x16` (Ctrl+V) instead, mirroring iTerm's "Paste or send ^V".
// Restores the fallback that was removed alongside the rest of
// `setupPasteHandler` in #3582.
//
// Capture phase on the wrapper runs before xterm's textarea/element paste
// listeners, so `stopImmediatePropagation` cleanly preempts the bracketed-paste
// wrap.

export function isNonTextPaste(event: ClipboardEvent): boolean {
	const data = event.clipboardData;
	if (!data) return false;
	const text = data.getData("text/plain");
	if (text) return false;
	// Some browsers leave `types` empty for direct file payloads — check
	// `files` independently so we don't miss them.
	if ((data.files?.length ?? 0) > 0) return true;
	const types = Array.from(data.types);
	// Trade-off: any non-text/plain type (including a rare `text/html`-only
	// clipboard from some rich-text editors) triggers `^V`. Matches the
	// pre-#3582 behavior. In a plain shell readline interprets `^V` as
	// "verbatim-next" and stalls one keystroke; we accept that to avoid
	// false negatives on image/file payloads where `types` is non-standard.
	return types.length > 0 && types.some((t) => t !== "text/plain");
}

export function handleImagePasteFallback(
	event: ClipboardEvent,
	terminal: XTerm,
): void {
	if (!isNonTextPaste(event)) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	terminal.input("\x16", true);
}

export function installImagePasteFallback(
	terminal: XTerm,
	wrapper: HTMLElement,
): () => void {
	const handler = (event: ClipboardEvent) => {
		handleImagePasteFallback(event, terminal);
	};

	wrapper.addEventListener("paste", handler, { capture: true });
	return () => {
		wrapper.removeEventListener("paste", handler, { capture: true });
	};
}
