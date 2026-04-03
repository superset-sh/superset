import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

// ---------------------------------------------------------------------------
// WebGL failure tracking — shared across all runtimes (VS Code pattern).
// Once WebGL fails, every subsequent runtime skips it to avoid repeated errors.
// ---------------------------------------------------------------------------
let suggestedRendererType: "webgl" | "dom" | undefined;

/**
 * Load optional addons after the terminal is open. Returns a dispose function
 * that cleans up the WebGL renderer and cancels any pending rAF.
 *
 * Addons are split into two groups:
 *   1. Sync addons loaded immediately after open() — safe, lightweight.
 *   2. WebGL deferred to the next animation frame so xterm's internal
 *      setTimeout (Viewport.syncScrollArea) completes with the DOM renderer
 *      before we swap to GPU.
 */
export function loadAddons(terminal: XTerm): () => void {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;

	// --- Sync addons ---
	terminal.loadAddon(new ClipboardAddon());

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

	terminal.loadAddon(new ImageAddon());

	try {
		terminal.loadAddon(new LigaturesAddon());
	} catch {
		// Ligatures not supported by the current font — safe to ignore.
	}

	// --- Deferred GPU renderer ---
	const rafId = requestAnimationFrame(() => {
		if (disposed) return;
		if (suggestedRendererType === "dom") return;

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
		} catch {
			// ignore
		}
		webglAddon = null;
	};
}
