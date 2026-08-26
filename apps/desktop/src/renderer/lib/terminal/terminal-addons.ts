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

	// Every terminal attempts WebGL on its own. A failure here degrades THIS
	// terminal to xterm's DOM renderer, which costs 1.2x (a TUI redrawing a few
	// dirty rows) to 13.7x (bulk scrolling output) more renderer CPU — so it
	// must never be latched for the session.
	// Losses are routinely transient (a driver reset after an OS update) or
	// routine (browsers cap live WebGL contexts, so opening enough terminals
	// evicts the oldest), and latching turned either into a permanently
	// degraded session recoverable only by restarting the app (GH #6822).
	const rafId = requestAnimationFrame(() => {
		if (disposed) return;

		try {
			webglAddon = new WebglAddon();
			webglAddon.onContextLoss(() => {
				webglAddon?.dispose();
				webglAddon = null;
				console.warn(
					"[terminal] WebGL context lost — this terminal falls back to the DOM renderer",
				);
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
		} catch (err) {
			console.warn(
				"[terminal] WebGL renderer unavailable — this terminal falls back to the DOM renderer",
				err,
			);
			// xterm's AddonManager pushes the addon and wraps its dispose
			// BEFORE calling activate(), and does not roll back when activate
			// throws. Dropping the reference alone would strand the instance in
			// the manager for the terminal's lifetime, so dispose it explicitly.
			try {
				webglAddon?.dispose();
			} catch {}
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
