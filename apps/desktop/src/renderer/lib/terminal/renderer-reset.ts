import type { Terminal as XTerm } from "@xterm/xterm";

export interface RendererResetTarget {
	clearTextureAtlas(): void;
}

// Truecolor-heavy TUIs mint unbounded glyph variants, growing the WebGL glyph
// atlas without bound (SUPER-1793); reset it after this many page adds.
export const ATLAS_PAGE_ADDS_BEFORE_RESET = 32;

/**
 * Repaint a terminal the way a resize does, without resizing it.
 *
 * `refresh()` is not enough on its own: WebglRenderer skips every cell whose
 * cached render model still matches the buffer, so a pane whose on-screen
 * pixels drifted from that model (stale glyphs after a spell parked off-DOM)
 * repaints nothing. `clearTextureAtlas()` clears the model too, which is the
 * half of a resize that actually repairs the screen (#3321, #3504). The other
 * half — a cols change, SIGWINCH, full reflow, and a host-side resize sync
 * boundary that reanchors every other client — is unnecessary, because the
 * buffer was right all along.
 *
 * `renderer` is null when WebGL is unavailable or its context was lost; xterm's
 * DOM renderer keeps no atlas, so the refresh is the whole fix there.
 */
export function resetTerminalRenderer(
	terminal: Pick<XTerm, "rows" | "refresh">,
	renderer: RendererResetTarget | null,
): void {
	renderer?.clearTextureAtlas();
	terminal.refresh(0, Math.max(0, terminal.rows - 1));
}
