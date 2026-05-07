import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
	dispose: () => void;
}

// Once WebGL fails (construction throw or runtime context loss), skip it for
// the rest of the session. Both signals indicate the GPU path is unhealthy
// in this renderer process — VS Code does the same.
let suggestedRendererType: "webgl" | "dom" | undefined;

/**
 * Load non-renderer addons onto an already-opened terminal. The WebGL renderer
 * is intentionally not attached here — it's tied to container lifecycle by
 * `attachWebglRenderer` so parked terminals don't hold GPU contexts.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	terminal.loadAddon(new ClipboardAddon());

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
		dispose: () => {},
	};
}

/**
 * Attach the WebGL renderer to a terminal whose wrapper is in the live DOM.
 * Returns null when WebGL is unavailable (construction failed or a prior
 * context loss flipped the session to DOM-only). On context loss, the addon
 * disposes itself and the session falls back to DOM rendering. The caller
 * supplies `onLost` so it can clear its own reference to the now-disposed
 * addon (the runtime keeps a `webglAddon` field that would otherwise hold a
 * stale handle until the next attach/detach cycle).
 */
export function attachWebglRenderer(
	terminal: XTerm,
	onLost?: () => void,
): WebglAddon | null {
	if (suggestedRendererType === "dom") return null;

	let addon: WebglAddon;
	try {
		addon = new WebglAddon();
	} catch {
		suggestedRendererType = "dom";
		return null;
	}

	addon.onContextLoss(() => {
		suggestedRendererType = "dom";
		try {
			addon.dispose();
		} catch {}
		onLost?.();
		terminal.refresh(0, terminal.rows - 1);
	});

	try {
		terminal.loadAddon(addon);
	} catch {
		suggestedRendererType = "dom";
		try {
			addon.dispose();
		} catch {}
		return null;
	}

	return addon;
}

export function detachWebglRenderer(addon: WebglAddon): void {
	try {
		addon.dispose();
	} catch {}
}
