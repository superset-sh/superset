import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { Terminal as XTerm } from "@xterm/xterm";
import { Utf8Base64 } from "./clipboard-base64";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
}

/**
 * Load optional addons onto an already-opened terminal. The WebGL renderer is
 * not loaded here — it's managed per-terminal by webgl-renderer.ts, acquired
 * on attach and released on park so live GPU contexts stay bounded to visible
 * terminals.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	// Utf8Base64 replaces the addon's UTF-8-unsafe default codec (#4839).
	terminal.loadAddon(new ClipboardAddon(new Utf8Base64()));

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

	terminal.loadAddon(new ImageAddon());

	const searchAddon = new SearchAddon();
	terminal.loadAddon(searchAddon);

	const progressAddon = new ProgressAddon();
	terminal.loadAddon(progressAddon);

	try {
		terminal.loadAddon(new LigaturesAddon());
	} catch {}

	return {
		searchAddon,
		progressAddon,
	};
}
