/**
 * Proportional RTL rows. The terminal draws every glyph inside a fixed-width
 * cell, so narrow Hebrew letters float apart and read thin. For a row laid out
 * right-to-left (terminal-bidi.ts, right-alignment on), the patched WebGL
 * renderer hands each cell to `takeCell`, which records it and blanks the
 * glyph so only the cell background is drawn there. This module then paints
 * the row as real text — system font, natural spacing — on a transparent
 * canvas laid over the terminal, anchored to the row's right edge.
 *
 * Left in cells: the cursor's row, rows with inverse cells (a TUI's own
 * cursor or selection), and everything while the feature is off.
 */
import type { BidiRow } from "./terminal-bidi";

export interface OverlayCell {
	/** The cell's text; " " for empty or invisible cells. */
	ch: string;
	/** Embedding level is odd: the cell belongs to a right-to-left run. */
	rtl: boolean;
	/** Text style; cells with the same style and direction share one draw. */
	style: TextStyle;
}

export interface TextStyle {
	color: string;
	bold: boolean;
	italic: boolean;
	dim: boolean;
}

export interface Segment {
	/** Logical order for RTL segments, left-to-right for LTR ones. */
	text: string;
	rtl: boolean;
	style: TextStyle;
}

export interface RowLayout {
	/** Visual column of the rightmost non-blank cell: the text's right edge. */
	right: number;
	/** In drawing order: from the right edge leftward. */
	segments: Segment[];
}

const DEFAULT_STYLE: TextStyle = {
	color: "",
	bold: false,
	italic: false,
	dim: false,
};

const sameStyle = (a: TextStyle, b: TextStyle) =>
	a.color === b.color &&
	a.bold === b.bold &&
	a.italic === b.italic &&
	a.dim === b.dim;

const isBlank = (c: OverlayCell | undefined) =>
	!c || c.ch === " " || c.ch === "";

/** Groups a row's visual cells (left to right) into the runs to draw. */
export function layoutRow(
	cells: readonly (OverlayCell | undefined)[],
): RowLayout | null {
	let right = cells.length - 1;
	while (right >= 0 && isBlank(cells[right])) right--;
	if (right < 0) return null;
	let left = 0;
	while (left < right && isBlank(cells[left])) left++;

	const segments: Segment[] = [];
	let cur: Segment | null = null;
	for (let x = right; x >= left; x--) {
		const cell = isBlank(cells[x]) ? undefined : cells[x];
		const ch = cell ? cell.ch : " ";
		// A space never starts a new run: it stays with the text before it.
		if (
			cur &&
			(!cell || (cur.rtl === cell.rtl && sameStyle(cur.style, cell.style)))
		) {
			cur.text = cur.rtl ? cur.text + ch : ch + cur.text;
			continue;
		}
		cur = {
			text: ch,
			rtl: cell?.rtl ?? true,
			style: cell?.style ?? DEFAULT_STYLE,
		};
		segments.push(cur);
	}
	return { right, segments };
}

// ---------------------------------------------------------------------------
// Runtime: everything below touches the live xterm WebGL renderer.

export interface OverlayCellData {
	content: number;
	getChars(): string;
	getFgColorMode(): number;
	getFgColor(): number;
	isBold(): number;
	isItalic(): number;
	isDim(): number;
	isInvisible(): number;
}

export interface OverlayLine {
	getFg?(index: number): number;
}

/** The private fields of xterm's WebglRenderer this module reads. */
export interface OverlayRenderer {
	_canvas?: HTMLCanvasElement;
	_devicePixelRatio?: number;
	_core?: { options?: Record<string, unknown> };
	_themeService?: {
		colors?: { foreground?: { css: string }; ansi?: { css: string }[] };
	};
	dimensions?: {
		css: {
			cell: { width: number; height: number };
			canvas: { width: number; height: number };
		};
	};
}

export interface OverlayRow extends BidiRow {
	/** Set when the overlay paints this row; the renderer then calls takeCell. */
	hide?: boolean;
	cells?: (OverlayCell | undefined)[];
	renderer?: OverlayRenderer;
}

interface OverlayState {
	canvas: HTMLCanvasElement | null;
	/** Viewport rows refreshed since the last paint: cleared, then repainted. */
	touched: Set<number>;
	rows: Map<number, OverlayRow>;
	scheduled: boolean;
}

/** Same reasoning as terminal-bidi's glyph font: what macOS draws Hebrew in. */
const RTL_FONT = "system-ui";
const FG_INVERSE = 0x4000000;
const CM_P16 = 0x1000000;
const CM_P256 = 0x2000000;
const CM_RGB = 0x3000000;
const CODEPOINT_MASK = 0x1fffff;
const IS_COMBINED_MASK = 0x200000;

const states = new WeakMap<object, OverlayState>();

function stateFor(r: OverlayRenderer): OverlayState {
	let st = states.get(r);
	if (!st) {
		st = {
			canvas: null,
			touched: new Set(),
			rows: new Map(),
			scheduled: false,
		};
		states.set(r, st);
	}
	return st;
}

/**
 * Called once per row the renderer refreshes. Decides whether the overlay
 * paints this row; when it does, marks `row.hide` so the renderer hands its
 * cells to `takeCell`. Every refreshed row is cleared on the overlay, so a
 * row that stops qualifying falls back to cells without leftovers.
 */
export function claimRow(
	renderer: OverlayRenderer | undefined,
	row: OverlayRow | null,
	line: OverlayLine,
	cols: number,
	y: number | undefined,
	cursorRow: boolean | undefined,
	enabled: boolean,
): void {
	if (!renderer || y === undefined) return;
	const st = stateFor(renderer);
	st.touched.add(y);
	st.rows.delete(y);
	schedule(renderer, st);
	if (!row || !row.rtl || !enabled || cursorRow) return;
	for (let x = 0; x < cols; x++) {
		if ((line.getFg?.(x) ?? 0) & FG_INVERSE) return;
	}
	row.hide = true;
	row.cells = new Array(cols);
	row.renderer = renderer;
	st.rows.set(y, row);
}

/** Records the cell drawn at visual column x, then blanks its glyph. */
export function takeCell(
	row: OverlayRow,
	x: number,
	cell: OverlayCellData,
): void {
	try {
		recordCell(row, x, cell);
	} catch {
		return; // leave the glyph in its cell
	}
	cell.content = (cell.content & ~(CODEPOINT_MASK | IS_COMBINED_MASK)) | 0x20;
}

function recordCell(row: OverlayRow, x: number, cell: OverlayCellData): void {
	if (!row.cells || !row.renderer) throw new Error("row was not claimed");
	const logical = row.order[x];
	row.cells[x] = {
		ch: cell.isInvisible() ? " " : cell.getChars() || " ",
		rtl: row.levels[logical] % 2 === 1,
		style: styleOf(row.renderer, cell),
	};
}

function styleOf(r: OverlayRenderer, cell: OverlayCellData): TextStyle {
	const colors = r._themeService?.colors;
	const bold = !!cell.isBold();
	let color = colors?.foreground?.css ?? "";
	const mode = cell.getFgColorMode();
	let c = cell.getFgColor();
	if (mode === CM_RGB) color = `#${c.toString(16).padStart(6, "0")}`;
	else if (mode === CM_P16 || mode === CM_P256) {
		if (
			bold &&
			c < 8 &&
			r._core?.options?.drawBoldTextInBrightColors !== false
		) {
			c += 8;
		}
		color = colors?.ansi?.[c]?.css ?? color;
	}
	return { color, bold, italic: !!cell.isItalic(), dim: !!cell.isDim() };
}

function schedule(r: OverlayRenderer, st: OverlayState): void {
	if (st.scheduled) return;
	st.scheduled = true;
	// Runs right after the renderer's model update, before the frame is shown.
	queueMicrotask(() => {
		st.scheduled = false;
		try {
			paint(r, st);
		} catch {
			// the overlay is optional; a failed paint must not break rendering
		} finally {
			st.touched.clear();
			st.rows.clear();
		}
	});
}

function ensureCanvas(
	r: OverlayRenderer,
	st: OverlayState,
): CanvasRenderingContext2D | null {
	const gl = r._canvas;
	const dims = r.dimensions?.css;
	const parent = gl?.parentElement;
	if (!gl || !parent || !dims) return null;
	let c = st.canvas;
	if (!c || c.parentElement !== parent) {
		c?.remove();
		const overlay = gl.ownerDocument.createElement("canvas");
		overlay.className = "xterm-bidi-overlay";
		overlay.style.cssText =
			"position:absolute;left:0;top:0;pointer-events:none;";
		gl.insertAdjacentElement("afterend", overlay);
		// Leave with the WebGL canvas (addon disposed, e.g. on context loss and
		// the DOM-renderer fallback), so no stale text stays on screen.
		const observer = new MutationObserver(() => {
			if (gl.parentElement === parent) return;
			observer.disconnect();
			overlay.remove();
			if (st.canvas === overlay) st.canvas = null;
		});
		observer.observe(parent, { childList: true });
		st.canvas = c = overlay;
	}
	const dpr = r._devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
	const w = Math.round(dims.canvas.width * dpr);
	const h = Math.round(dims.canvas.height * dpr);
	if (c.width !== w || c.height !== h) {
		c.width = w;
		c.height = h;
		c.style.width = `${dims.canvas.width}px`;
		c.style.height = `${dims.canvas.height}px`;
	}
	c.style.left = gl.style.left || "0";
	c.style.top = gl.style.top || "0";
	const ctx = c.getContext("2d");
	ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
	return ctx;
}

function paint(r: OverlayRenderer, st: OverlayState): void {
	if (!st.touched.size) return;
	const ctx = ensureCanvas(r, st);
	const dims = r.dimensions?.css;
	if (!ctx || !dims) return;
	const cellW = dims.cell.width;
	const cellH = dims.cell.height;
	for (const y of st.touched) {
		ctx.clearRect(0, y * cellH, dims.canvas.width, cellH);
	}
	if (!st.rows.size) return;

	const opts = r._core?.options ?? {};
	const size = Number(opts.fontSize ?? 14);
	const family = String(opts.fontFamily ?? "monospace");
	const weight = String(opts.fontWeight ?? "normal");
	const boldWeight = String(opts.fontWeightBold ?? "bold");
	const fallbackColor = r._themeService?.colors?.foreground?.css ?? "#fff";

	ctx.textBaseline = "middle";
	ctx.textAlign = "right";
	for (const [y, row] of st.rows) {
		const layout = row.cells && layoutRow(row.cells);
		if (!layout) continue;
		let right = (layout.right + 1) * cellW;
		const middle = y * cellH + cellH / 2;
		for (const seg of layout.segments) {
			const s = seg.style;
			const font = seg.rtl ? `${RTL_FONT}, ${family}` : family;
			ctx.font = `${s.italic ? "italic " : ""}${s.bold ? boldWeight : weight} ${size}px ${font}`;
			ctx.direction = seg.rtl ? "rtl" : "ltr";
			ctx.fillStyle = s.color || fallbackColor;
			ctx.globalAlpha = s.dim ? 0.5 : 1;
			ctx.fillText(seg.text, right, middle);
			right -= ctx.measureText(seg.text).width;
		}
	}
	ctx.globalAlpha = 1;
}
