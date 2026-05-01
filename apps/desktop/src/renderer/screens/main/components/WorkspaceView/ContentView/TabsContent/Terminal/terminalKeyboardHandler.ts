import type { Terminal as XTerm } from "@xterm/xterm";
import { resolveHotkeyFromEvent } from "renderer/hotkeys";
import { translateLineEditChord } from "renderer/lib/terminal/line-edit-translations";
import {
	shouldBubbleClipboardShortcut,
	shouldSelectAllShortcut,
} from "./clipboardShortcuts";

export interface KeyboardHandlerOptions {
	/**
	 * Callback for Shift+Enter. When provided, the handler intercepts Shift+Enter
	 * before xterm so the consumer can emit a custom sequence (e.g. ESC+CR to
	 * keep line-continuation working in Claude Code without the "\" appearing).
	 *
	 * When omitted, Shift+Enter is left alone so xterm's kitty keyboard
	 * encoding (`\x1b[13;2u`) reaches the pty — required for Codex, whose
	 * Ink TUI listens for the CSI-u sequence rather than ESC+CR (issue #3942).
	 */
	onShiftEnter?: () => void;
	onWrite?: (data: string) => void;
}

/**
 * Setup keyboard handling for xterm including:
 * - Shortcut forwarding: App hotkeys bubble to document where useAppHotkey listens
 * - Shift+Enter: Optionally rerouted via `onShiftEnter`; otherwise xterm's
 *   kitty keyboard encoding handles it natively
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

		if (isShiftEnter && options.onShiftEnter) {
			if (event.type === "keydown") {
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
