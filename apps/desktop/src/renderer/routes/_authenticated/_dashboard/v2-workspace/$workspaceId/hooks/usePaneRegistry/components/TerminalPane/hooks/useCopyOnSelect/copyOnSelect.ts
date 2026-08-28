import type { Terminal as XTerm } from "@xterm/xterm";

/**
 * Trailing whitespace on a selected row is padding xterm reports as part of
 * the line, not text the user dragged over. Ghostty trims it the same way.
 */
export function trimSelectionForCopy(selection: string): string {
	return selection
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n");
}

/**
 * Copy the terminal's selection to the clipboard as soon as it is made —
 * Ghostty's `copy-on-select = clipboard`, iTerm2's default.
 *
 * Chromium rejects clipboard writes from an unfocused document (the same
 * reason FocusAwareClipboardProvider exists), and a selection can change
 * while the window is in the background — a reflow on resize, say — so those
 * writes are skipped instead of left to reject.
 */
export function installCopyOnSelect(
	terminal: XTerm,
	onCopied?: () => void,
): () => void {
	// xterm fires onSelectionChange for events that leave the selection intact
	// (a refresh, a re-focus); those must not each hit the clipboard.
	let lastCopied: string | null = null;

	const subscription = terminal.onSelectionChange(() => {
		const selection = terminal.getSelection();
		if (!selection || !document.hasFocus()) return;

		const text = trimSelectionForCopy(selection);
		if (text === lastCopied) return;
		lastCopied = text;

		void navigator.clipboard.writeText(text).then(
			() => onCopied?.(),
			() => {
				// A rejected write must not suppress a later attempt at the same
				// text, and must not flash the "copied" indicator.
				if (lastCopied === text) lastCopied = null;
			},
		);
	});

	return () => subscription.dispose();
}
