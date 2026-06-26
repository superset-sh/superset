import type { Terminal as XTerm } from "@xterm/xterm";
import { resolveHotkeyFromEvent } from "renderer/hotkeys";
import {
	shouldBubbleClipboardShortcut,
	shouldSelectAllShortcut,
} from "./clipboard-shortcuts";
import { translateLineEditChord } from "./line-edit-translations";

export interface TerminalKeyEventHandlerOptions {
	platform?: string;
}

function resolvePlatform(options: TerminalKeyEventHandlerOptions): string {
	const raw =
		options.platform !== undefined
			? options.platform
			: typeof navigator !== "undefined"
				? navigator.platform
				: "";
	const lower = raw.toLowerCase();
	// Node's `process.platform === "darwin"` is a common explicit input;
	// without normalization it'd match `"win"` substring and be treated as
	// Windows. Browser/Electron `navigator.platform` returns "MacIntel" so
	// this only kicks in for Node-style callers (incl. tests).
	if (lower === "darwin") return "mac";
	return lower;
}

// xterm's _keyDown calls stopPropagation after processing, so any chord we
// want the host (react-hotkeys-hook, Electron menu accelerators) or the shell
// (Ctrl+A/E/U escape sequences for line edit) to see must short-circuit xterm
// before it runs. (VSCode pattern: terminalInstance.ts:1116-1175.)
//
// Kitty keyboard protocol is enabled, which means every Mac Cmd chord xterm
// sees gets CSI-u encoded and leaks into TUIs as a literal char. Ghostty
// sidesteps this by suppressing all super/Cmd chords on macOS before the
// encoder runs (ghostty/src/input/key_encode.zig:534-545). We do the same via
// shouldBubbleClipboardShortcut's Mac branch.
function isKittyKeyboardActive(terminal: XTerm): boolean {
	// xterm doesn't expose this through public API. `flags > 0` means a TUI
	// has pushed kitty mode (CSI > Ps u); when so, Enter chords should skip
	// translation so the TUI receives the kitty CSI-u encoding it expects.
	const flags = (
		terminal as unknown as {
			_core?: { coreService?: { kittyKeyboard?: { flags?: number } } };
		}
	)._core?.coreService?.kittyKeyboard?.flags;
	return typeof flags === "number" && flags > 0;
}

export function createTerminalKeyEventHandler(
	terminal: XTerm,
	options: TerminalKeyEventHandlerOptions = {},
) {
	const platform = resolvePlatform(options);
	const isMac = platform.includes("mac");
	const isWindows = platform.includes("win");

	return (event: KeyboardEvent): boolean => {
		if (resolveHotkeyFromEvent(event) !== null) return false;

		const translation = translateLineEditChord(event, {
			isMac,
			isWindows,
			kittyKeyboardActive: isKittyKeyboardActive(terminal),
		});
		if (translation !== null) {
			if (event.type === "keydown") {
				event.preventDefault();
				terminal.input(translation, true);
			}
			return false;
		}

		if (shouldSelectAllShortcut(event, isMac)) {
			if (event.type === "keydown") {
				event.preventDefault();
				terminal.selectAll();
			}
			return false;
		}

		if (
			shouldBubbleClipboardShortcut(event, {
				isMac,
				isWindows,
				hasSelection: terminal.hasSelection(),
			})
		) {
			// Do NOT preventDefault: the browser keydown -> paste pipeline is what
			// fires xterm's paste event. We only short-circuit xterm's key encoder.
			return false;
		}

		return true;
	};
}

export function installTerminalKeyEventHandler(
	terminal: XTerm,
	options: TerminalKeyEventHandlerOptions = {},
): () => void {
	terminal.attachCustomKeyEventHandler(
		createTerminalKeyEventHandler(terminal, options),
	);

	return () => {
		terminal.attachCustomKeyEventHandler(() => true);
	};
}
