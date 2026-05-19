/**
 * Wait for the configured terminal font to finish loading before refitting xterm.
 *
 * xterm measures cell width at `terminal.open()` time using whatever font the
 * browser has resolved so far. If a custom `@font-face` (or a user-selected
 * system font that the browser hasn't surfaced yet) finishes loading after
 * that measurement, the cached glyph metrics — and, with the WebGL renderer,
 * the texture atlas — diverge from the actual rendered font, producing
 * "mangled" text that only repairs on the next resize. See issue #4617 and
 * `plans/20260425-v2-terminal-rendering-divergences.md` (#1).
 *
 * Callers `await` this before re-fitting / refreshing the terminal.
 */

import type { Terminal as XTerm } from "@xterm/xterm";

const DEFAULT_FONT_LOAD_TIMEOUT_MS = 2000;

export interface FontReadyTarget {
	fontFamily: string;
	fontSize: number;
	timeoutMs?: number;
}

export async function waitForFontReady({
	fontFamily,
	fontSize,
	timeoutMs = DEFAULT_FONT_LOAD_TIMEOUT_MS,
}: FontReadyTarget): Promise<void> {
	if (typeof document === "undefined") return;
	const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
	if (!fonts || typeof fonts.load !== "function") return;

	const spec = `${fontSize}px ${fontFamily}`;

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<void>((resolve) => {
		timeoutId = setTimeout(resolve, timeoutMs);
	});

	try {
		await Promise.race([
			Promise.resolve(fonts.load(spec)).then(() => {}),
			timeoutPromise,
		]);
	} catch {
		// Swallow — caller still refits even if the load promise rejected,
		// so a poisoned spec can't permanently block rendering recovery.
	} finally {
		if (timeoutId !== null) clearTimeout(timeoutId);
	}
}

/**
 * Wait for the terminal's configured font to load, then clear the texture
 * atlas and run a refit. Shared between v1 and v2 — both need identical
 * "measured-too-early" recovery after `terminal.open()` and after
 * font-setting changes. `refit` should return true iff terminal dimensions
 * changed (so the caller can propagate to the PTY). `isAlive` is checked
 * after the await to bail when the terminal has been disposed/detached
 * while the font was loading.
 */
export function scheduleFontSettleRefit(
	terminal: XTerm,
	isAlive: () => boolean,
	refit: () => boolean,
	onDimensionsChanged?: () => void,
): void {
	const fontFamily = String(terminal.options.fontFamily ?? "").trim();
	if (!fontFamily) return;
	const fontSize = Number(terminal.options.fontSize ?? 14);

	void waitForFontReady({ fontFamily, fontSize }).then(() => {
		if (!isAlive()) return;
		// xterm no-ops this when WebGL isn't the active renderer.
		try {
			terminal.clearTextureAtlas();
		} catch {}
		const changed = refit();
		if (changed) onDimensionsChanged?.();
	});
}
