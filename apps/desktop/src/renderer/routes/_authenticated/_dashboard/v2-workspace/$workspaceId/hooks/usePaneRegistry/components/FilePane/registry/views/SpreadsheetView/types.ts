export type CellKind = "text" | "number" | "boolean" | "error";

export interface GridCell {
	text: string;
	kind: CellKind;
	formula?: string;
	value?: string;
}

export interface CellPosition {
	row: number;
	col: number;
}

/** Inclusive bounds. */
export interface CellRange {
	top: number;
	left: number;
	bottom: number;
	right: number;
}

/** Half-open window of cells: rows [rowStart, rowEnd), columns [colStart, colEnd). */
export interface CellWindow {
	rowStart: number;
	rowEnd: number;
	colStart: number;
	colEnd: number;
}

export interface FrozenPane {
	rows: number;
	cols: number;
}

export interface SheetSummary {
	name: string;
	hidden: boolean;
	rowCount: number;
	colCount: number;
	/** Longest text per column over the first rows, in characters. */
	colChars: number[];
	merges: CellRange[];
	frozen: FrozenPane;
}

/** Flat [row, col, row, col, ...] pairs in reading order. */
export interface SearchResult {
	matches: number[];
	truncated: boolean;
}

export interface CopyResult {
	text: string;
	/** Cells written; less than the selection when truncated. */
	cells: number;
	truncated: boolean;
}

export type UnreadableReason = "password" | "unsupported";

export type WorkbookSource =
	| { kind: "text"; text: string; fileName: string }
	| { kind: "bytes"; bytes: Uint8Array; fileName: string };
