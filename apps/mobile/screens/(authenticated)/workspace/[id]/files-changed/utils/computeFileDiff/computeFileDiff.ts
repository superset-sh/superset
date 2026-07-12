import { structuredPatch } from "diff";

export type DiffLineType = "add" | "del" | "context";

export interface DiffToken {
	content: string;
	color?: string;
}

export interface HunkSpan {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
}

export type DiffRow =
	| { kind: "hunk"; key: string; header: string }
	| {
			kind: "line";
			key: string;
			type: DiffLineType;
			oldLineNumber: number | null;
			newLineNumber: number | null;
			text: string;
			tokens?: DiffToken[];
	  }
	| {
			kind: "expander";
			key: string;
			path: string;
			gap: { newStart: number; newEnd: number; delta: number };
	  }
	| { kind: "truncated"; key: string; hiddenCount: number };

export interface FileDiffData {
	rows: DiffRow[];
	hunks: HunkSpan[];
	newLines: string[];
	newLineCount: number;
	newTokens: DiffToken[][] | null;
	maxLineChars: number;
	truncated: boolean;
}

const CONTEXT_LINES = 3;
const MAX_ROWS = 2_000;
export const EXPAND_CHUNK_LINES = 20;

/** Tabs break monospace width math — normalize before diffing/tokenizing. */
export function expandTabs(contents: string): string {
	return contents.includes("\t") ? contents.replaceAll("\t", "    ") : contents;
}

export function computeFileDiff(
	path: string,
	oldContents: string,
	newContents: string,
): FileDiffData {
	const patch = structuredPatch(
		path,
		path,
		oldContents,
		newContents,
		undefined,
		undefined,
		{ context: CONTEXT_LINES },
	);

	const rows: DiffRow[] = [];
	const hunks: HunkSpan[] = [];
	let maxLineChars = 0;
	let total = 0;
	for (const hunk of patch.hunks) {
		total += 1 + hunk.lines.length;
	}

	for (const hunk of patch.hunks) {
		if (rows.length >= MAX_ROWS) break;
		hunks.push({
			oldStart: hunk.oldStart,
			oldLines: hunk.oldLines,
			newStart: hunk.newStart,
			newLines: hunk.newLines,
		});
		rows.push({
			kind: "hunk",
			key: `${path}@@${hunk.oldStart}:${hunk.newStart}`,
			header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
		});
		let oldLineNumber = hunk.oldStart;
		let newLineNumber = hunk.newStart;
		for (const [index, line] of hunk.lines.entries()) {
			if (rows.length >= MAX_ROWS) break;
			const marker = line[0];
			// "\ No newline at end of file" markers carry no line content.
			if (marker === "\\") continue;
			const key = `${path}@@${hunk.oldStart}:${hunk.newStart}:${index}`;
			const text = line.slice(1);
			if (text.length > maxLineChars) maxLineChars = text.length;
			if (marker === "+") {
				rows.push({
					kind: "line",
					key,
					type: "add",
					oldLineNumber: null,
					newLineNumber: newLineNumber++,
					text,
				});
			} else if (marker === "-") {
				rows.push({
					kind: "line",
					key,
					type: "del",
					oldLineNumber: oldLineNumber++,
					newLineNumber: null,
					text,
				});
			} else {
				rows.push({
					kind: "line",
					key,
					type: "context",
					oldLineNumber: oldLineNumber++,
					newLineNumber: newLineNumber++,
					text,
				});
			}
		}
	}

	const truncated = total > MAX_ROWS;
	if (truncated) {
		rows.push({
			kind: "truncated",
			key: `${path}@@truncated`,
			hiddenCount: total - MAX_ROWS,
		});
	}

	const newLines = newContents.length === 0 ? [] : newContents.split("\n");
	for (const line of newLines) {
		if (line.length > maxLineChars) maxLineChars = line.length;
	}

	return {
		rows,
		hunks,
		newLines,
		newLineCount: newLines.length,
		newTokens: null,
		maxLineChars,
		truncated,
	};
}

/**
 * Attach per-line syntax tokens from whole-file tokenizations of each side.
 * Del lines read from the old side; add/context lines from the new side.
 */
export function attachDiffTokens(
	data: FileDiffData,
	oldLines: Array<Array<{ content: string; color?: string }>> | null,
	newLines: Array<Array<{ content: string; color?: string }>> | null,
): FileDiffData {
	const newTokens = newLines
		? newLines.map((line) =>
				line.map((token) => ({ content: token.content, color: token.color })),
			)
		: null;
	if (!oldLines && !newTokens) return data;
	const rows = data.rows.map((row) => {
		if (row.kind !== "line") return row;
		const source =
			row.type === "del"
				? (oldLines?.[(row.oldLineNumber ?? 0) - 1] ?? null)
				: (newTokens?.[(row.newLineNumber ?? 0) - 1] ?? null);
		if (!source) return row;
		return {
			...row,
			tokens: source.map((token) => ({
				content: token.content,
				color: token.color,
			})),
		};
	});
	return { ...data, rows, newTokens };
}
