/**
 * Redraw the visible terminal area after `fitAddon.fit()` has updated cell
 * dimensions. When the cell grid actually changed (or when the caller knows
 * the WebGL texture atlas is otherwise suspect), the atlas is cleared first
 * so stale glyphs rasterized against the previous metrics aren't painted
 * over the new layout.
 *
 * Without this clear, the macOS GPU compositor's atlas pages can retain
 * mismatched glyphs across a resize (or simply degrade silently across a
 * long session — see issue #4010), producing the overlapping / garbled
 * characters reported in issue #4753. The v1 terminal cache has run this
 * pattern since #4010 was fixed; v2's `measureAndResize` was missing the
 * atlas clear, which this helper now consolidates so both paths behave
 * identically.
 */

import type { Terminal as XTerm } from "@xterm/xterm";

export interface RefreshAfterFitOptions {
	/**
	 * Force the texture atlas to be cleared even if cell dimensions are
	 * unchanged. Used on reattach, where the GPU compositor may have
	 * corrupted atlas pages without firing `onContextLoss`.
	 */
	clearAtlas?: boolean;
}

export function refreshAfterFit(
	terminal: XTerm,
	dimensionsChanged: boolean,
	options: RefreshAfterFitOptions = {},
): void {
	if (options.clearAtlas || dimensionsChanged) {
		// xterm no-ops `clearTextureAtlas` when WebGL isn't the active
		// renderer; guard with try/catch in case a runtime build doesn't
		// expose it at all.
		try {
			terminal.clearTextureAtlas();
		} catch {}
	}
	terminal.refresh(0, Math.max(0, terminal.rows - 1));
}
