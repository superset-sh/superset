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

/**
 * True only when every file on the clipboard is an image.
 *
 * `isNonTextPaste` is true for ANY file payload, because Chromium synthesizes a
 * File entry for a copied document exactly as it does for a screenshot. The
 * path below it is an IMAGE path — it signals `^V` so a TUI attaches the
 * payload — so a copied PDF, archive or script reached Claude Code as an
 * attachment instead of a path (#7904). The MIME type is the signal that
 * separates them.
 *
 * EVERY file has to pass, including one whose `type` is empty because the
 * browser could not determine it: dropping the unknown ones first let
 * `[screenshot.png, mystery-file]` read as "all images" — the unknown entry was
 * removed from the list, `every()` then held, and the payload took the image
 * path instead of pasting a path (#7904 review). An unconfirmed type is not an
 * image, so the answer errs toward the path.
 */
export function isImageFilePaste(event: ClipboardEvent): boolean {
	const files = Array.from(event.clipboardData?.files ?? []);
	return (
		files.length > 0 &&
		files.every((file) => file?.type?.startsWith("image/") === true)
	);
}

/**
 * A path the way a shell needs it: bare when it holds nothing a shell would
 * split or interpret, single-quoted otherwise. A document called
 * `annual report.pdf` used to paste as TWO arguments — the space separated it —
 * so the command opened neither file (#7904 review). Quoting only when needed
 * leaves the common case (`notes.pdf` into a TUI prompt) byte-for-byte as it
 * was.
 */
function quotePath(path: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(path)) return path;
	return `'${path.replace(/'/g, `'\\''`)}'`;
}

function filePaths(files: File[]): string[] {
	return files
		.map((file) => {
			const absolute = (
				globalThis as unknown as {
					window?: {
						webUtils?: { getPathForFile?: (file: File) => string };
					};
				}
			).window?.webUtils?.getPathForFile?.(file);
			return absolute || file.name;
		})
		.filter(Boolean);
}

export function handleImagePasteFallback(
	event: ClipboardEvent,
	terminal: XTerm,
	getOverride?: () => ImagePasteOverride | null,
): void {
	if (!isNonTextPaste(event)) return;

	const files = Array.from(event.clipboardData?.files ?? []);

	if (!isImageFilePaste(event)) {
		// A remote workspace's PTY shell cannot read a local path, so a
		// document paste there must ship the bytes through the override like
		// an image paste does — pasting `/Users/alice/...` into a sandbox that
		// never saw that file is the same dead end as attaching an image by
		// name. The override consulted here is the same one the image branch
		// uses; only a local workspace (no override) falls back to text.
		const override = getOverride?.() ?? null;
		if (override) {
			event.preventDefault();
			event.stopImmediatePropagation();
			override(files);
			return;
		}

		// A local non-image file wants its path as text. Pasting nothing here
		// is what made the gesture look like it did something while the
		// document never arrived.
		const paths = filePaths(files).map(quotePath);
		if (paths.length === 0) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		terminal.paste(paths.join(" "));
		return;
	}

	event.preventDefault();
	event.stopImmediatePropagation();
	const override = getOverride?.() ?? null;
	if (override) {
		// File handles stay readable after dispatch; the list itself doesn't.
		override(files);
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
