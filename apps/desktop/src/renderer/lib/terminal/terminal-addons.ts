import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	dispose: () => void;
}

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function and the SearchAddon instance. WebGL is deferred to rAF to avoid
 * racing with xterm's post-open viewport sync.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;

	terminal.loadAddon(new ClipboardAddon());

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

	terminal.loadAddon(new ImageAddon());

	const searchAddon = new SearchAddon();
	terminal.loadAddon(searchAddon);

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
