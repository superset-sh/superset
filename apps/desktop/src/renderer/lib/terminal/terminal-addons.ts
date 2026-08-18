import { ClipboardAddon } from "@xterm/addon-clipboard";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";
import { Utf8Base64 } from "./clipboard-base64";
import { FocusAwareClipboardProvider } from "./clipboard-provider";

export interface LoadAddonsResult {
	searchAddon: SearchAddon;
	progressAddon: ProgressAddon;
	setLigaturesEnabled: (enabled: boolean) => void;
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

// Truecolor-heavy TUIs mint unbounded glyph variants, growing the WebGL glyph
// atlas without bound (SUPER-1793); reset it after this many page adds.
const ATLAS_PAGE_ADDS_BEFORE_RESET = 32;

/**
 * Load optional addons onto an already-opened terminal. Returns a cleanup
 * function and addon instances. WebGL is deferred to rAF to avoid
 * racing with xterm's post-open viewport sync.
 */
export function loadAddons(
	terminal: XTerm,
	options: { ligatures: boolean },
): LoadAddonsResult {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;
	let ligaturesAddon: LigaturesAddon | null = null;

	// Utf8Base64 replaces the addon's UTF-8-unsafe default codec (#4839).
	terminal.loadAddon(
		new ClipboardAddon(new Utf8Base64(), new FocusAwareClipboardProvider()),
	);

	const unicode11 = new Unicode11Addon();
	terminal.loadAddon(unicode11);
	terminal.unicode.activeVersion = "11";

	terminal.loadAddon(new ImageAddon());

	const searchAddon = new SearchAddon();
	terminal.loadAddon(searchAddon);

	const progressAddon = new ProgressAddon();
	terminal.loadAddon(progressAddon);

	const setLigaturesEnabled = (enabled: boolean) => {
		if (disposed) return;
		if (!enabled) {
			try {
				ligaturesAddon?.dispose();
			} catch {}
			ligaturesAddon = null;
			return;
		}
		if (ligaturesAddon) return;
		try {
			ligaturesAddon = new LigaturesAddon();
			terminal.loadAddon(ligaturesAddon);
		} catch {
			ligaturesAddon = null;
		}
	};
	setLigaturesEnabled(options.ligatures);

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
			// Subscribe before loadAddon: the first page-add fires during activation.
			let atlasPageAdds = 0;
			webglAddon.onAddTextureAtlasCanvas(() => {
				if (++atlasPageAdds >= ATLAS_PAGE_ADDS_BEFORE_RESET) {
					atlasPageAdds = 0;
					// Defer: the event fires mid-glyph-draw; clearing synchronously
					// would wipe the atlas under the in-flight rasterization.
					queueMicrotask(() => webglAddon?.clearTextureAtlas());
				}
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
		setLigaturesEnabled,
		dispose: () => {
			disposed = true;
			cancelAnimationFrame(rafId);
			try {
				ligaturesAddon?.dispose();
			} catch {}
			ligaturesAddon = null;
			try {
				webglAddon?.dispose();
			} catch {}
			webglAddon = null;
		},
	};
}
