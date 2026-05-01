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
 * Creates the keyboard handler function for xterm without attaching it.
 * Exported for unit tests — prefer {@link setupKeyboardHandler} in production code.
 * @internal exported only for tests
 */
export function createTerminalKeyboardHandler(
	xterm: Pick<XTerm, "selectAll" | "hasSelection">,
	options: KeyboardHandlerOptions = {},
): (event: KeyboardEvent) => boolean {
	const platform =
		typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";
	const isMac = platform.includes("mac");
	const isWindows = platform.includes("win");

	return (event: KeyboardEvent): boolean => {
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
	const handler = createTerminalKeyboardHandler(xterm, options);
	xterm.attachCustomKeyEventHandler(handler);

	return () => {
		xterm.attachCustomKeyEventHandler(() => true);
	};
}
