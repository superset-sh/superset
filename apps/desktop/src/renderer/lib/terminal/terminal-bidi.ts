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
 * hook installed by `installTerminalBidi` on `globalThis`.
 */

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
}

interface BidiLine {
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
 */
export function computeBidiRow(cells: readonly BidiCell[]): BidiRow | null {
	const n = cells.length;
	const kinds = new Uint8Array(n);
	let hasRtl = false;
	for (let i = 0; i < n; i++) {
		kinds[i] = classify(cells[i]);
		if (kinds[i] === Kind.R) hasRtl = true;
	}
	if (!hasRtl) return null;

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
	let lastStrong = Kind.L;
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

	// N1/N2: a neutral run between two RTL-ish sides is RTL, otherwise LTR
	// (paragraph direction; row start/end count as LTR).
	const levels = new Uint8Array(n);
	const rtlish = (k: number) => k === Kind.R || k === Kind.AN;
	let i = 0;
	while (i < n) {
		const k = kinds[i];
		if (k !== Kind.N) {
			levels[i] = k === Kind.R ? 1 : k === Kind.AN ? 2 : 0;
			i++;
			continue;
		}
		let j = i;
		while (j < n && kinds[j] === Kind.N) j++;
		const before = i > 0 && rtlish(kinds[i - 1]);
		const after = j < n && rtlish(kinds[j]);
		const level = before && after ? 1 : 0;
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
	for (let x = 0; x < n; x++) {
		const logical = order[x];
		if (levels[logical] % 2 === 1 && MIRRORED[cells[logical].codePoint]) {
			mirror[x] = 1;
		}
	}
	return { order, mirror };
}

function rowFromLine(line: BidiLine, cols: number): BidiRow | null {
	let hasRtl = false;
	for (let x = 0; x < cols; x++) {
		if (isRtlCodePoint(line.getCodePoint(x))) {
			hasRtl = true;
			break;
		}
	}
	if (!hasRtl) return null;
	const cells: BidiCell[] = new Array(cols);
	for (let x = 0; x < cols; x++) {
		cells[x] = { codePoint: line.getCodePoint(x), width: line.getWidth(x) };
	}
	return computeBidiRow(cells);
}

/** Swap a loaded cell's glyph for its mirrored pair, e.g. "(" -> ")". */
export function mirrorCell(cell: MutableCell): void {
	if (cell.content & IS_COMBINED_MASK) return;
	const mirrored = MIRRORED[cell.content & CODEPOINT_MASK];
	if (mirrored === undefined) return;
	cell.content = (cell.content & ~CODEPOINT_MASK) | mirrored;
}

export interface TerminalBidiHook {
	row: (line: BidiLine, cols: number) => BidiRow | null;
	mirrorCell: (cell: MutableCell) => void;
}

declare global {
	// Read by the patched @xterm/addon-webgl renderer.
	var __supersetTerminalBidi: TerminalBidiHook | undefined;
}

export function installTerminalBidi(): void {
	globalThis.__supersetTerminalBidi = { row: rowFromLine, mirrorCell };
}
