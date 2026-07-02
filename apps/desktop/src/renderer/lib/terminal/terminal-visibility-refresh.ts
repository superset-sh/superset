/**
 * Minimal slice of the xterm API the visibility refresh needs. Kept as a
 * structural type so it can be unit-tested with a plain fake terminal.
 */
export interface RefreshableTerminal {
	readonly rows: number;
	/**
	 * Present on real xterm instances — rebuilds the renderer's glyph atlas.
	 * Optional so the DOM renderer (which has no atlas) is tolerated.
	 */
	clearTextureAtlas?: () => void;
	refresh: (start: number, end: number) => void;
}

/** Minimal slice of `document` used for visibility detection. */
export interface VisibilityDocument {
	readonly visibilityState: DocumentVisibilityState;
	addEventListener: (type: "visibilitychange", listener: () => void) => void;
	removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}

/**
 * Repaint the terminal whenever the page returns to the foreground.
 *
 * When the OS locks the screen or the display sleeps, the GPU can discard the
 * WebGL renderer's backing store WITHOUT dispatching `webglcontextlost`. The
 * `onContextLoss` fallback in terminal-addons.ts therefore never fires, so on
 * unlock xterm keeps drawing from a stale/blank texture atlas — cells render as
 * garbled, overlapping, or blank glyphs ("UI strange after unlocking screen
 * lock", issue #5261). The only other repaint trigger is the ResizeObserver,
 * which stays silent when the unlocked window is the same size as before.
 *
 * Clearing the texture atlas forces xterm to rebuild glyphs from scratch and
 * `refresh()` redraws every visible row, recovering the display.
 *
 * @returns a disposer that removes the listener.
 */
export function installVisibilityRefresh(
	terminal: RefreshableTerminal,
	doc: VisibilityDocument = document,
): () => void {
	const handler = () => {
		if (doc.visibilityState !== "visible") return;
		terminal.clearTextureAtlas?.();
		terminal.refresh(0, Math.max(0, terminal.rows - 1));
	};
	doc.addEventListener("visibilitychange", handler);
	return () => doc.removeEventListener("visibilitychange", handler);
}
