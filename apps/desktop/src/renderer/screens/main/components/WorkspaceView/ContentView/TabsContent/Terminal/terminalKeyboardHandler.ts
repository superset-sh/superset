import type { Terminal as XTerm } from "@xterm/xterm";
import {
	isTerminalReservedEvent,
	resolveHotkeyFromEvent,
} from "renderer/hotkeys";
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

		const isCmdBackspace =
			event.key === "Backspace" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCmdBackspace) {
			if (event.type === "keydown" && options.onWrite) {
				event.preventDefault();
				options.onWrite("\x15\x1b[D"); // Ctrl+U + left arrow
			}
			return false;
		}

		// Cmd+Left: Move cursor to beginning of line (sends Ctrl+A)
		const isCmdLeft =
			event.key === "ArrowLeft" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCmdLeft) {
			if (event.type === "keydown" && options.onWrite) {
				event.preventDefault();
				options.onWrite("\x01"); // Ctrl+A - beginning of line
			}
			return false;
		}

		// Cmd+Right: Move cursor to end of line (sends Ctrl+E)
		const isCmdRight =
			event.key === "ArrowRight" &&
			event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCmdRight) {
			if (event.type === "keydown" && options.onWrite) {
				event.preventDefault();
				options.onWrite("\x05"); // Ctrl+E - end of line
			}
			return false;
		}

		// Option+Left/Right (macOS): word navigation (Meta+B / Meta+F)
		const isOptionLeft =
			event.key === "ArrowLeft" &&
			event.altKey &&
			isMac &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey;

		if (isOptionLeft) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bb"); // Meta+B - backward word
			}
			return false;
		}

		// Option+Right: Move cursor forward by word (Meta+F)
		const isOptionRight =
			event.key === "ArrowRight" &&
			event.altKey &&
			isMac &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey;

		if (isOptionRight) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bf"); // Meta+F - forward word
			}
			return false;
		}

		// Ctrl+Left/Right (Windows): word navigation (Meta+B / Meta+F)
		const isCtrlLeft =
			event.key === "ArrowLeft" &&
			event.ctrlKey &&
			isWindows &&
			!event.metaKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCtrlLeft) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bb"); // Meta+B - backward word
			}
			return false;
		}

		const isCtrlRight =
			event.key === "ArrowRight" &&
			event.ctrlKey &&
			isWindows &&
			!event.metaKey &&
			!event.altKey &&
			!event.shiftKey;

		if (isCtrlRight) {
			if (event.type === "keydown" && options.onWrite) {
				options.onWrite("\x1bf"); // Meta+F - forward word
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

		// Unregistered terminal-reserved chords (ctrl+c/d/z/s/q) stay with xterm.
		if (isTerminalReservedEvent(event)) return true;

		return true;
	};

	xterm.attachCustomKeyEventHandler(handler);

	return () => {
		xterm.attachCustomKeyEventHandler(() => true);
	};
}
