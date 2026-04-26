import type { Terminal as XTerm } from "@xterm/xterm";
import { resolveHotkeyFromEvent } from "renderer/hotkeys";
import { translateLineEditChord } from "renderer/lib/terminal/line-edit-translations";
import {
	shouldBubbleClipboardShortcut,
	shouldSelectAllShortcut,
} from "./clipboardShortcuts";

export interface KeyboardHandlerOptions {
	/** Callback for Shift+Enter (sends ESC+CR to avoid \ appearing in Claude Code while keeping line continuation behavior) */
	onShiftEnter?: () => void;
	onWrite?: (data: string) => void;
}

/**
 * Setup keyboard handling for xterm including:
 * - Shortcut forwarding: App hotkeys bubble to document where useAppHotkey listens
 * - Shift+Enter: Sends ESC+CR sequence (to avoid \ appearing in Claude Code while keeping line continuation behavior)
 *
 * Returns a cleanup function to remove the handler.
 */
export function setupKeyboardHandler(
	xterm: XTerm,
	options: KeyboardHandlerOptions = {},
): () => void {
	const platform =
		typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";
	const isMac = platform.includes("mac");
	const isWindows = platform.includes("win");

	const handler = (event: KeyboardEvent): boolean => {
		// Match v2: registered app hotkeys must escape xterm before terminal
		// translations or macOS Cmd bubbling can consume them.
		if (resolveHotkeyFromEvent(event) !== null) return false;

		const isShiftEnter =
			event.key === "Enter" &&
			event.shiftKey &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey;

		if (isShiftEnter) {
			if (event.type === "keydown" && options.onShiftEnter) {
				event.preventDefault();
				options.onShiftEnter();
			}
			return false;
		}

		const translation = translateLineEditChord(event, { isMac, isWindows });
		if (translation !== null) {
			if (event.type === "keydown" && options.onWrite) {
				event.preventDefault();
				options.onWrite(translation);
			}
			return false;
		}

		if (shouldSelectAllShortcut(event, isMac)) {
			if (event.type === "keydown") {
				event.preventDefault();
				xterm.selectAll();
			}
			return false;
		}

		// Mirror VS Code terminal clipboard bindings so host copy/paste happens
		// before kitty CSI-u handling in xterm consumes the command chord.
		if (
			shouldBubbleClipboardShortcut(event, {
				isMac,
				isWindows,
				hasSelection: xterm.hasSelection(),
			})
		) {
			return false;
		}

		// Default: let xterm process unhandled keys, including terminal-reserved
		// chords like ctrl+c/d/z/s/q.
		return true;
	};

	xterm.attachCustomKeyEventHandler(handler);

	return () => {
		xterm.attachCustomKeyEventHandler(() => true);
	};
}
