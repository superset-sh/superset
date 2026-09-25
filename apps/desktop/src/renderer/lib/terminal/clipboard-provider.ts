import type { IClipboardProvider } from "@xterm/addon-clipboard";

/**
 * Clipboard provider for xterm's ClipboardAddon (OSC 52 copy/paste).
 *
 * OSC 52 arrives from the PTY whenever the program decides to copy, which is
 * routinely while the window is in the background. Chromium rejects clipboard
 * writes from an unfocused document, and the addon's default provider leaves
 * that rejection unhandled.
 */
export class FocusAwareClipboardProvider implements IClipboardProvider {
	readText(): Promise<string> {
		return navigator.clipboard.readText();
	}

	async writeText(_selection: string, text: string): Promise<void> {
		if (!document.hasFocus()) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			if (error instanceof DOMException && error.name === "NotAllowedError") {
				return;
			}
			throw error;
		}
	}
}
