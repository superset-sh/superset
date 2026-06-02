import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";
import { Utf8Base64 } from "./clipboard-base64";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function and addon instances. WebGL is deferred to rAF to avoid
 * racing with xterm's post-open viewport sync.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;

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

	const rafId = requestAnimationFrame(() => {
		if (disposed || suggestedRendererType === "dom") return;

		try {
			webglAddon = new WebglAddon();
			webglAddon.onContextLoss(() => {
				webglAddon?.dispose();
				webglAddon = null;
				suggestedRendererType = "dom";
				terminal.refresh(0, terminal.rows - 1);
			});
			terminal.loadAddon(webglAddon);
		} catch {
			suggestedRendererType = "dom";
			webglAddon = null;
		}
	});

	return {
		searchAddon,
		progressAddon,
		dispose: () => {
			disposed = true;
			cancelAnimationFrame(rafId);
			try {
				webglAddon?.dispose();
			} catch {}
			webglAddon = null;
		},
	};
}
