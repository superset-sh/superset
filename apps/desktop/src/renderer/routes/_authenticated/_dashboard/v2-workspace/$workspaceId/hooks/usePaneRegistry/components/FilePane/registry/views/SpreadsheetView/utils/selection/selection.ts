import type { CellPosition, CellRange } from "../../types";

/** The anchor is the active cell; the head is the corner a Shift move extends. */
export interface Selection {
	anchor: CellPosition;
	head: CellPosition;
}

export interface NavigationInput {
	key: string;
	shiftKey: boolean;
	/** Cmd on macOS, Ctrl elsewhere. */
	primaryKey: boolean;
}

export interface GridBounds {
	rows: number;
	cols: number;
}

export const ORIGIN: CellPosition = { row: 0, col: 0 };

export function collapsed(cell: CellPosition): Selection {
	return { anchor: cell, head: cell };
}

const cellRange = ({ row, col }: CellPosition): CellRange => ({
	top: row,
	left: col,
	bottom: row,
	right: col,
});

const contains = (range: CellRange, { row, col }: CellPosition) =>
	row >= range.top &&
	row <= range.bottom &&
	col >= range.left &&
	col <= range.right;

const overlaps = (a: CellRange, b: CellRange) =>
	a.top <= b.bottom &&
	b.top <= a.bottom &&
	a.left <= b.right &&
	b.left <= a.right;

export function mergeAt(
	merges: readonly CellRange[],
	cell: CellPosition,
): CellRange | undefined {
	return merges.find((merge) => contains(merge, cell));
}

/** The cell itself, or the whole merge it belongs to. */
export function activeCellRange(
	{ anchor }: Selection,
	merges: readonly CellRange[] = [],
): CellRange {
	return mergeAt(merges, anchor) ?? cellRange(anchor);
}

/** Moves the active cell to the top-left cell of the merge it falls in. */
export function normalizeSelection(
	selection: Selection,
	merges: readonly CellRange[],
): Selection {
	const merge = mergeAt(merges, selection.anchor);
	if (!merge) return selection;
	const anchor = { row: merge.top, col: merge.left };
	return contains(merge, selection.head)
		? collapsed(anchor)
		: { anchor, head: selection.head };
}

/** The selected rectangle, grown until no merge is cut by its edge. */
export function selectionRange(
	{ anchor, head }: Selection,
	merges: readonly CellRange[] = [],
): CellRange {
	const range = {
		top: Math.min(anchor.row, head.row),
		left: Math.min(anchor.col, head.col),
		bottom: Math.max(anchor.row, head.row),
		right: Math.max(anchor.col, head.col),
	};
	let grown = true;
	while (grown) {
		grown = false;
		for (const merge of merges) {
			if (!overlaps(range, merge)) continue;
			if (
				merge.top < range.top ||
				merge.left < range.left ||
				merge.bottom > range.bottom ||
				merge.right > range.right
			) {
				range.top = Math.min(range.top, merge.top);
				range.left = Math.min(range.left, merge.left);
				range.bottom = Math.max(range.bottom, merge.bottom);
				range.right = Math.max(range.right, merge.right);
				grown = true;
			}
		}
	}
	return range;
}

export function clampSelection(
	selection: Selection,
	bounds: GridBounds,
): Selection {
	return {
		anchor: clampCell(selection.anchor, bounds),
		head: clampCell(selection.head, bounds),
	};
}

function clampCell(cell: CellPosition, { rows, cols }: GridBounds) {
	return {
		row: Math.max(0, Math.min(cell.row, rows - 1)),
		col: Math.max(0, Math.min(cell.col, cols - 1)),
	};
}

const ARROWS: Record<string, [number, number]> = {
	ArrowUp: [-1, 0],
	ArrowDown: [1, 0],
	ArrowLeft: [0, -1],
	ArrowRight: [0, 1],
};

/** Spreadsheet keyboard navigation. Returns null for keys it does not own. */
export function moveSelection(
	selection: Selection,
	input: NavigationInput,
	bounds: GridBounds,
	pageRows: number,
	merges: readonly CellRange[] = [],
): Selection | null {
	const { key, shiftKey, primaryKey } = input;
	const lastRow = bounds.rows - 1;
	const lastCol = bounds.cols - 1;
	const from = shiftKey ? selection.head : selection.anchor;
	const place = (cell: CellPosition, extend: boolean): Selection => {
		const target = clampCell(cell, bounds);
		return extend
			? { anchor: selection.anchor, head: target }
			: normalizeSelection(collapsed(target), merges);
	};
	// One step leaves a merge by its far edge.
	const step = (cell: CellPosition, dRow: number, dCol: number) => {
		const span = mergeAt(merges, cell) ?? cellRange(cell);
		return {
			row: dRow > 0 ? span.bottom + 1 : dRow < 0 ? span.top - 1 : cell.row,
			col: dCol > 0 ? span.right + 1 : dCol < 0 ? span.left - 1 : cell.col,
		};
	};

	const arrow = ARROWS[key];
	if (arrow) {
		const [dRow, dCol] = arrow;
		if (primaryKey) {
			return place(
				{
					row: dRow === 0 ? from.row : dRow < 0 ? 0 : lastRow,
					col: dCol === 0 ? from.col : dCol < 0 ? 0 : lastCol,
				},
				shiftKey,
			);
		}
		return place(step(from, dRow, dCol), shiftKey);
	}

	const active = selection.anchor;
	switch (key) {
		case "Tab":
			return place(step(active, 0, shiftKey ? -1 : 1), false);
		case "Enter":
			return place(step(active, shiftKey ? -1 : 1, 0), false);
		case "PageDown":
			return place({ row: from.row + pageRows, col: from.col }, shiftKey);
		case "PageUp":
			return place({ row: from.row - pageRows, col: from.col }, shiftKey);
		case "Home":
			return place({ row: primaryKey ? 0 : from.row, col: 0 }, shiftKey);
		case "End":
			return primaryKey
				? place({ row: lastRow, col: lastCol }, shiftKey)
				: place({ row: from.row, col: lastCol }, shiftKey);
		default:
			return null;
	}
}
