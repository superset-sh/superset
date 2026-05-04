import { quote } from "shell-quote";

export function shellEscapePaths(paths: string[]): string {
	return quote(paths);
}

export interface ClipboardPasteEvent {
	clipboardData: Pick<DataTransfer, "getData"> | null;
	preventDefault: () => void;
}

export interface ClipboardPasteSink {
	isClosed: () => boolean;
	paste: (text: string) => void;
}

/**
 * Bridge browser paste events into the v2 terminal runtime.
 *
 * xterm.js installs its own paste listeners on the textarea/element it manages,
 * but those don't always fire — e.g. when the wrapper has been reparented or
 * focus is on the container instead of the inner textarea. This helper runs as
 * a fallback on the React-controlled container so clipboard text still reaches
 * the PTY (preserving xterm's bracketed-paste handling via `sink.paste`).
 *
 * Returns `true` when the paste was forwarded so callers can verify in tests.
 */
export function handleClipboardPaste(
	event: ClipboardPasteEvent,
	sink: ClipboardPasteSink,
): boolean {
	if (sink.isClosed()) return false;
	const text = event.clipboardData?.getData("text/plain");
	if (!text) return false;
	event.preventDefault();
	sink.paste(text);
	return true;
}
