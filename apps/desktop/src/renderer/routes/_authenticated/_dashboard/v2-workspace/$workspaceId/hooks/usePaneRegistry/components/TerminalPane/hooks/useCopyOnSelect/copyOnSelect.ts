import type { Terminal as XTerm } from "@xterm/xterm";
import { writeTerminalClipboard } from "renderer/lib/terminal/terminal-clipboard";
import { getTerminalSelectionForCopy } from "renderer/lib/terminal/terminal-copy";

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
	writeText: (text: string) => Promise<void> = writeTerminalClipboard,
): () => void {
	// xterm fires onSelectionChange for events that leave the selection intact
	// (a refresh, a re-focus); those must not each hit the clipboard.
	let lastCopied: string | null = null;
	let disposed = false;

	const subscription = terminal.onSelectionChange(() => {
		const text = getTerminalSelectionForCopy(terminal);
		if (!text && !(terminal.hasSelection?.() ?? !!terminal.getSelection())) {
			lastCopied = null;
			return;
		}
		if (!document.hasFocus() || text === lastCopied) return;
		lastCopied = text;

		void writeText(text).then(
			() => {
				if (!disposed) onCopied?.();
			},
			() => {
				// A rejected write must not suppress a later attempt at the same
				// text, and must not flash the "copied" indicator.
				if (lastCopied === text) lastCopied = null;
			},
		);
	});

	return () => {
		disposed = true;
		subscription.dispose();
	};
}
