import type { NumberSeparators } from "@superset/i18n/format";
import type {
	CellRange,
	CellWindow,
	CopyResult,
	GridCell,
	SearchResult,
	SheetSummary,
	UnreadableReason,
	WorkbookSource,
} from "../../types";

export type SheetRequestBody =
	| { type: "open"; source: WorkbookSource }
	| {
			type: "cells";
			sheet: number;
			window: CellWindow;
			numbers: NumberSeparators;
	  }
	| {
			type: "search";
			sheet: number;
			query: string;
			caseSensitive: boolean;
			limit: number;
			numbers: NumberSeparators;
	  }
	| {
			type: "tsv";
			sheet: number;
			range: CellRange;
			numbers: NumberSeparators;
	  };

export interface SheetResults {
	open: SheetSummary[];
	cells: (GridCell | null)[][];
	search: SearchResult;
	tsv: CopyResult;
}

export type SheetRequest = SheetRequestBody & { id: number };

export type SheetResponse =
	| {
			[T in keyof SheetResults]: {
				id: number;
				type: T;
				ok: true;
				result: SheetResults[T];
			};
	  }[keyof SheetResults]
	/** reason is null when there is nothing useful to tell beyond "unreadable". */
	| { id: number; ok: false; reason: UnreadableReason | null };
