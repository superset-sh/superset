/**
 * Display-time bidi for the terminal grid (Hebrew, Arabic and other RTL
 * scripts). xterm.js stores and draws cells strictly left-to-right, so RTL
 * text comes out letter-reversed. This module computes, per row, the visual
 * order of the row's cells using a reduced Unicode Bidirectional Algorithm
 * with a left-to-right paragraph level — the same "implicit bidi" approach
 * Konsole and Apple Terminal take. Only drawing is affected: the buffer,
 * cursor addressing, input and copy all stay in logical order, so TUIs keep
 * working and copied text pastes correctly.
 *
 * The patched WebGL renderer (patches/@xterm%2Faddon-webgl@*.patch) reads the
 * hook installed by `installTerminalBidi` on `globalThis`. Right-to-left rows
 * can be drawn as proportional text instead of per-cell glyphs
 * (terminal-bidi-overlay.ts).
 */

import {
	claimRow,
	type OverlayLine,
	type OverlayRenderer,
	type OverlayRow,
	takeCell,
} from "./terminal-bidi-overlay";

export interface BidiCell {
	/** Unicode code point; 0 for an empty cell. */
	codePoint: number;
	/** Cell width: 1, 2 for the head of a wide char, 0 for its tail. */
	width: number;
}

export interface BidiRow {
	/** order[visualX] = logicalX */
	order: Int32Array;
	/** 1 when the glyph at visualX must be drawn mirrored, e.g. "(" as ")". */
	mirror: Uint8Array;
	/** visualOf[logicalX] = visualX — where the cursor cell is drawn. */
	visualOf: Int32Array;
	/** Embedding level per logical cell; odd = right-to-left. */
	levels: Uint8Array;
	/** The row was laid out as a right-to-left paragraph. */
	rtl: boolean;
}

interface BidiLine extends OverlayLine {
	getCodePoint(index: number): number;
	getWidth(index: number): number;
}

interface MutableCell {
	content: number;
}

const CODEPOINT_MASK = 0x1fffff;
const IS_COMBINED_MASK = 0x200000;

const MIRRORED: Record<number, number> = {
	40: 0x29, // ( )
	41: 0x28,
	60: 0x3e, // < >
	62: 0x3c,
	91: 0x5d, // [ ]
	93: 0x5b,
	123: 0x7d, // { }
	125: 0x7b,
	171: 0xbb, // « »
	187: 0xab,
};

/** ":" "," "." "/" — joins two digit runs into one number. */
const NUMBER_SEPARATORS = new Set([0x2c, 0x2e, 0x2f, 0x3a]);

/** opener -> closer, and the reverse, for ( [ { */
const BRACKET_CLOSE_OF: Record<number, number> = {
	40: 0x29,
	91: 0x5d,
	123: 0x7d,
};
const BRACKET_OPEN_OF: Record<number, number> = {
	41: 0x28,
	93: 0x5b,
	125: 0x7b,
};

export function isRtlCodePoint(cp: number): boolean {
	return (
		(cp >= 0x0590 && cp <= 0x08ff) || // Hebrew, Arabic, Syriac, Thaana, NKo…
		(cp >= 0xfb1d && cp <= 0xfdff) || // Hebrew + Arabic presentation forms A
		(cp >= 0xfe70 && cp <= 0xfeff) // Arabic presentation forms B
	);
}

enum Kind {
	L = 0,
	R = 1,
	N = 2,
	EN = 3,
	/** Digits that follow RTL text: kept left-to-right inside the RTL run. */
	AN = 4,
}

function isLetterLike(cp: number): boolean {
	// Anything with a case or in a letter block counts as strong LTR; plain
	// ASCII punctuation, spaces and box drawing stay neutral.
	return (
		(cp >= 0x41 && cp <= 0x5a) ||
		(cp >= 0x61 && cp <= 0x7a) ||
		(cp >= 0xc0 && cp <= 0x024f && cp !== 0xd7 && cp !== 0xf7) ||
		(cp >= 0x0370 && cp <= 0x058f) ||
		(cp >= 0x0900 && cp <= 0x1fff) ||
		(cp >= 0x3040 && cp <= 0xd7ff)
	);
}

function classify(cell: BidiCell): Kind {
	// Wide chars (and their tail cells) are pinned as LTR so a pair never splits.
	if (cell.width !== 1) return Kind.L;
	const cp = cell.codePoint;
	if (cp === 0) return Kind.N;
	if (isRtlCodePoint(cp)) return Kind.R;
	if (cp >= 0x30 && cp <= 0x39) return Kind.EN;
	if (isLetterLike(cp)) return Kind.L;
	return Kind.N;
}

/**
 * Returns the visual order of a row, or null when the row has no RTL text
 * (the common case — callers then draw the row untouched).
 *
 * With `alignRight`, a row whose first strong character is RTL is laid out as
 * a right-to-left paragraph: the whole row is mirrored, so its text ends up
 * against the right edge, the way Hebrew is read.
 */
export function computeBidiRow(
	cells: readonly BidiCell[],
	alignRight = false,
): BidiRow | null {
	const n = cells.length;
	const kinds = new Uint8Array(n);
	let hasRtl = false;
	let firstStrong: Kind = Kind.N;
	for (let i = 0; i < n; i++) {
		kinds[i] = classify(cells[i]);
		if (kinds[i] === Kind.R) hasRtl = true;
		if (
			firstStrong === Kind.N &&
			(kinds[i] === Kind.L || kinds[i] === Kind.R)
		) {
			firstStrong = kinds[i];
		}
	}
	if (!hasRtl) return null;
	// P2/P3: paragraph level 1 (RTL) only when asked to and the row reads RTL.
	const base = alignRight && firstStrong === Kind.R ? Kind.R : Kind.L;

	// W4: one separator between digits belongs to the number ("19:00", "2.1").
	for (let i = 1; i < n - 1; i++) {
		if (
			kinds[i] === Kind.N &&
			NUMBER_SEPARATORS.has(cells[i].codePoint) &&
			kinds[i - 1] === Kind.EN &&
			kinds[i + 1] === Kind.EN
		) {
			kinds[i] = Kind.EN;
		}
	}

	// W2/W7: digits take the direction of the last strong char before them.
	let lastStrong: Kind = base;
	for (let i = 0; i < n; i++) {
		const k = kinds[i];
		if (k === Kind.L || k === Kind.R) lastStrong = k;
		else if (k === Kind.EN) kinds[i] = lastStrong === Kind.R ? Kind.AN : Kind.L;
	}

	// N0 (simplified): a bracket pair around RTL text is RTL on both sides, so
	// "[לא חובה]" keeps its brackets together instead of splitting them.
	const openers: number[] = [];
	for (let i = 0; i < n; i++) {
		const cp = cells[i].codePoint;
		if (BRACKET_CLOSE_OF[cp] !== undefined) {
			openers.push(i);
			continue;
		}
		if (BRACKET_OPEN_OF[cp] === undefined) continue;
		let o = openers.length - 1;
		while (o >= 0 && BRACKET_CLOSE_OF[cells[openers[o]].codePoint] !== cp) o--;
		if (o < 0) continue;
		const open = openers[o];
		openers.length = o;
		for (let t = open + 1; t < i; t++) {
			if (kinds[t] === Kind.R || kinds[t] === Kind.AN) {
				kinds[open] = Kind.R;
				kinds[i] = Kind.R;
				break;
			}
		}
	}

	// N1/N2: a neutral run takes the direction its two sides share, otherwise
	// the paragraph's (row start/end count as the paragraph direction).
	// I1/I2: then each class gets its embedding level.
	const asStrong = (k: number): Kind =>
		k === Kind.R || k === Kind.AN ? Kind.R : Kind.L;
	const levelOf = (k: number): number => {
		if (base === Kind.L) return k === Kind.R ? 1 : k === Kind.AN ? 2 : 0;
		return k === Kind.R ? 1 : 2;
	};
	const levels = new Uint8Array(n);
	let i = 0;
	while (i < n) {
		const k = kinds[i];
		if (k !== Kind.N) {
			levels[i] = levelOf(k);
			i++;
			continue;
		}
		let j = i;
		while (j < n && kinds[j] === Kind.N) j++;
		const before = i > 0 ? asStrong(kinds[i - 1]) : base;
		const after = j < n ? asStrong(kinds[j]) : base;
		const level = levelOf(before === after ? before : base);
		for (let t = i; t < j; t++) levels[t] = level;
		i = j;
	}

	// L2: reverse every maximal run at or above each level, highest first.
	const order = new Int32Array(n);
	for (let t = 0; t < n; t++) order[t] = t;
	for (let level = 2; level >= 1; level--) {
		let s = 0;
		while (s < n) {
			if (levels[order[s]] < level) {
				s++;
				continue;
			}
			let e = s;
			while (e < n && levels[order[e]] >= level) e++;
			order.subarray(s, e).reverse();
			s = e;
		}
	}

	const mirror = new Uint8Array(n);
	const visualOf = new Int32Array(n);
	for (let x = 0; x < n; x++) {
		const logical = order[x];
		visualOf[logical] = x;
		if (levels[logical] % 2 === 1 && MIRRORED[cells[logical].codePoint]) {
			mirror[x] = 1;
		}
	}
	return { order, mirror, visualOf, levels, rtl: base === Kind.R };
}

const ALIGN_RIGHT_STORAGE_KEY = "superset.terminal.alignRtlRight";
const PROPORTIONAL_STORAGE_KEY = "superset.terminal.proportionalRtl";
const listeners = new Set<() => void>();
let alignRight = readFlag(ALIGN_RIGHT_STORAGE_KEY) === "1";
let proportional = readFlag(PROPORTIONAL_STORAGE_KEY) !== "0";

function readFlag(key: string): string | null {
	try {
		return globalThis.localStorage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

export function getTerminalAlignRight(): boolean {
	return alignRight;
}

/** Turn right-alignment of Hebrew rows on or off in every open terminal. */
export function setTerminalAlignRight(next: boolean): void {
	alignRight = next;
	try {
		globalThis.localStorage?.setItem(ALIGN_RIGHT_STORAGE_KEY, next ? "1" : "0");
	} catch {}
	for (const listener of listeners) listener();
}

export function getTerminalProportionalRtl(): boolean {
	return proportional;
}

/**
 * Draw right-aligned RTL rows as proportional text (on by default) or one
 * glyph per cell, in every open terminal.
 */
export function setTerminalProportionalRtl(next: boolean): void {
	proportional = next;
	try {
		globalThis.localStorage?.setItem(
			PROPORTIONAL_STORAGE_KEY,
			next ? "1" : "0",
		);
	} catch {}
	for (const listener of listeners) listener();
}

/** Called whenever the bidi layout changes; returns an unsubscribe. */
export function onTerminalBidiChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * Called by the patched renderer at the start of every row it refreshes.
 * `y` is the viewport row and `cursorRow` whether the cursor sits on it; both
 * feed the proportional overlay.
 */
function rowFromLine(
	line: BidiLine,
	cols: number,
	renderer?: OverlayRenderer,
	y?: number,
	cursorRow?: boolean,
): BidiRow | null {
	let hasRtl = false;
	for (let x = 0; x < cols; x++) {
		if (isRtlCodePoint(line.getCodePoint(x))) {
			hasRtl = true;
			break;
		}
	}
	let row: OverlayRow | null = null;
	if (hasRtl) {
		const cells: BidiCell[] = new Array(cols);
		for (let x = 0; x < cols; x++) {
			cells[x] = { codePoint: line.getCodePoint(x), width: line.getWidth(x) };
		}
		row = computeBidiRow(cells, alignRight);
	}
	try {
		claimRow(renderer, row, line, cols, y, cursorRow, proportional);
	} catch {
		// The overlay is optional: on any surprise the row is drawn in cells.
		if (row) row.hide = false;
	}
	return row;
}

/** Swap a loaded cell's glyph for its mirrored pair, e.g. "(" -> ")". */
export function mirrorCell(cell: MutableCell): void {
	if (cell.content & IS_COMBINED_MASK) return;
	const mirrored = MIRRORED[cell.content & CODEPOINT_MASK];
	if (mirrored === undefined) return;
	cell.content = (cell.content & ~CODEPOINT_MASK) | mirrored;
}

/**
 * Font for RTL glyphs, put ahead of the terminal font. The usual monospace
 * stacks reach Hebrew only through Courier New; the system UI font is what
 * macOS and most apps (Claude Desktop included) draw Hebrew in.
 */
const RTL_GLYPH_FONT = "system-ui";

/** CSS font-family prefix for one glyph: the RTL font for RTL text, else "". */
export function glyphFont(chars: string): string {
	return isRtlCodePoint(chars.codePointAt(0) ?? 0) ? `${RTL_GLYPH_FONT}, ` : "";
}

/** Whether the caret sits in right-to-left text: the level of the cell before it. */
export function isCursorInRtl(row: BidiRow | null, logicalX: number): boolean {
	if (!row) return false;
	const before = logicalX > 0 ? row.levels[logicalX - 1] : undefined;
	return (before ?? row.levels[logicalX] ?? 0) % 2 === 1;
}

interface RendererWithTerminal {
	_terminal?: object;
}

const cursorRtl = new WeakMap<object, boolean>();

function cursorAt(
	renderer: RendererWithTerminal,
	row: BidiRow | null,
	logicalX: number,
): void {
	if (renderer._terminal) {
		cursorRtl.set(renderer._terminal, isCursorInRtl(row, logicalX));
	}
}

const SWAPPED_ARROWS: Record<string, [key: string, keyCode: number]> = {
	ArrowLeft: ["ArrowRight", 39],
	ArrowRight: ["ArrowLeft", 37],
};

/**
 * Make Left/Right follow what's on screen. Programs move the caret in logical
 * order, so on a right-to-left stretch "left" (one character back) moves it
 * visually right. While the caret is in RTL text, swap the two keys before
 * xterm sees them. Returns a disposer.
 */
export function installBidiArrowKeys(terminal: {
	textarea?: HTMLTextAreaElement;
}): () => void {
	const textarea = terminal.textarea;
	if (!textarea) return () => {};
	const synthetic = new WeakSet<Event>();
	const onKeyDown = (e: KeyboardEvent) => {
		if (synthetic.has(e)) return;
		const swap = SWAPPED_ARROWS[e.key];
		if (!swap || !cursorRtl.get(terminal)) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		const [key, keyCode] = swap;
		const ev = new KeyboardEvent("keydown", {
			key,
			code: key,
			shiftKey: e.shiftKey,
			altKey: e.altKey,
			ctrlKey: e.ctrlKey,
			metaKey: e.metaKey,
			bubbles: true,
			cancelable: true,
		});
		// xterm reads the legacy keyCode/which, which the constructor can't set.
		Object.defineProperty(ev, "keyCode", { get: () => keyCode });
		Object.defineProperty(ev, "which", { get: () => keyCode });
		synthetic.add(ev);
		textarea.dispatchEvent(ev);
	};
	textarea.addEventListener("keydown", onKeyDown, true);
	return () => textarea.removeEventListener("keydown", onKeyDown, true);
}

export interface TerminalBidiHook {
	row: (
		line: BidiLine,
		cols: number,
		renderer?: OverlayRenderer,
		y?: number,
		cursorRow?: boolean,
	) => BidiRow | null;
	mirrorCell: (cell: MutableCell) => void;
	takeCell: typeof takeCell;
	glyphFont: (chars: string) => string;
	cursorAt: (
		renderer: RendererWithTerminal,
		row: BidiRow | null,
		logicalX: number,
	) => void;
}

declare global {
	// Read by the patched @xterm/addon-webgl renderer.
	var __supersetTerminalBidi: TerminalBidiHook | undefined;
}

export function installTerminalBidi(): void {
	globalThis.__supersetTerminalBidi = {
		row: rowFromLine,
		mirrorCell,
		takeCell,
		glyphFont,
		cursorAt,
	};
}
