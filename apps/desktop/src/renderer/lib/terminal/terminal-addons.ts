import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { Terminal as XTerm } from "@xterm/xterm";
import { createTerminalImageAddon } from "./terminal-image-addon";
import { loadTerminalWebglAddon } from "./terminal-webgl-addon-controller";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
	dispose: () => void;
}

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function and addon instances. WebGL setup/teardown is delegated to
 * loadTerminalWebglAddon.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	terminal.loadAddon(new ClipboardAddon());

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

	terminal.loadAddon(createTerminalImageAddon());

	const searchAddon = new SearchAddon();
	terminal.loadAddon(searchAddon);

	const progressAddon = new ProgressAddon();
	terminal.loadAddon(progressAddon);

	// LigaturesAddon intentionally omitted: when combined with the WebGL renderer
	// it corrupts the glyph atlas — styled cells (italic/color) bleed glyphs
	// into adjacent cells and the corruption survives resize. macOS surfaced
	// this most reliably; ligature support (==, =>, !==) is the trade-off.
	const webglAddon = loadTerminalWebglAddon(terminal);

	return {
		searchAddon,
		progressAddon,
		dispose: () => {
			webglAddon.dispose();
		},
	};
}
