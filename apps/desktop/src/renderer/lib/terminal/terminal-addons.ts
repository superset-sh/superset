import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function. WebGL is deferred to rAF to avoid racing with xterm's post-open
 * viewport sync.
 */
export function loadAddons(terminal: XTerm): () => void {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;

	terminal.loadAddon(new ClipboardAddon());

	terminal.loadAddon(new UnicodeGraphemesAddon());

	terminal.loadAddon(new ImageAddon());

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

	return () => {
		disposed = true;
		cancelAnimationFrame(rafId);
		try {
			webglAddon?.dispose();
		} catch {}
		webglAddon = null;
	};
}
