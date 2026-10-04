import type { CellPosition, CellRange } from "../../types";

export const ROW_HEIGHT = 24;
export const HEADER_HEIGHT = 24;
export const MIN_COLUMN_WIDTH = 32;
const CHAR_WIDTH = 7;
const CELL_PADDING = 16;
const MIN_ESTIMATED_WIDTH = 64;
const MAX_ESTIMATED_WIDTH = 320;

export function columnName(col: number): string {
	let name = "";
	for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
		name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
	}
	return name;
}

export function cellAddress({ row, col }: CellPosition): string {
	return `${columnName(col)}${row + 1}`;
}

export function rangeAddress(range: CellRange): string {
	const start = cellAddress({ row: range.top, col: range.left });
	if (range.top === range.bottom && range.left === range.right) return start;
	return `${start}:${cellAddress({ row: range.bottom, col: range.right })}`;
}

export function estimateColumnWidth(chars: number): number {
	return Math.min(
		MAX_ESTIMATED_WIDTH,
		Math.max(MIN_ESTIMATED_WIDTH, chars * CHAR_WIDTH + CELL_PADDING),
	);
}

export function gutterWidth(rowCount: number): number {
	return Math.max(40, String(rowCount).length * CHAR_WIDTH + CELL_PADDING);
}

/** starts[c] is the left edge of column c; the last entry is the total width. */
export function columnStarts(widths: number[]): number[] {
	const starts = [0];
	for (const width of widths) starts.push((starts.at(-1) ?? 0) + width);
	return starts;
}

export function columnAtOffset(starts: number[], x: number): number {
	let low = 0;
	let high = starts.length - 2;
	if (high < 0) return 0;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if ((starts[mid] ?? 0) <= x) low = mid;
		else high = mid - 1;
	}
	return low;
}

/**
 * The scroll offset that brings [start, end) into a viewport whose first
 * `stickySize` pixels sit under a sticky header, or null if already visible.
 */
export function revealOffset(
	start: number,
	end: number,
	scrollOffset: number,
	viewportSize: number,
	stickySize: number,
): number | null {
	if (start < scrollOffset + stickySize) return Math.max(0, start - stickySize);
	if (end > scrollOffset + viewportSize) {
		return Math.max(0, Math.min(start - stickySize, end - viewportSize));
	}
	return null;
}
