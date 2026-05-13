import { ClipboardAddon } from "@xterm/addon-clipboard";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";
import { createTerminalImageAddonController } from "./terminal-image-addon-controller";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
	enableImageAddon: () => void;
	disableImageAddon: () => void;
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

function afterPendingXtermRefresh(callback: () => void): number | null {
	if (typeof requestAnimationFrame !== "function") {
		setTimeout(callback, 0);
		return null;
	}
	return requestAnimationFrame(() => {
		requestAnimationFrame(callback);
	});
}

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function and addon instances. WebGL is deferred to rAF to avoid
 * racing with xterm's post-open viewport sync.
 */
export function loadAddons(terminal: XTerm): LoadAddonsResult {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;
	let webglFallbackScheduled = false;
	const imageAddonController = createTerminalImageAddonController(terminal);

	terminal.loadAddon(new ClipboardAddon());

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

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
				if (webglFallbackScheduled) return;
				webglFallbackScheduled = true;
				suggestedRendererType = "dom";
				const lostAddon = webglAddon;
				afterPendingXtermRefresh(() => {
					try {
						lostAddon?.dispose();
					} catch {}
					if (webglAddon === lostAddon) {
						webglAddon = null;
					}
					if (disposed) return;
					try {
						terminal.refresh(0, terminal.rows - 1);
					} catch {}
				});
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
		enableImageAddon: imageAddonController.enable,
		disableImageAddon: imageAddonController.disable,
		dispose: () => {
			disposed = true;
			imageAddonController.dispose();
			cancelAnimationFrame(rafId);
			try {
				webglAddon?.dispose();
			} catch {}
			webglAddon = null;
		},
	};
}
