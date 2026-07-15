import { structuredPatch } from "diff";

export type DiffLineType = "add" | "del" | "context";

export type DiffRow =
	| { kind: "hunk"; key: string; header: string }
	| {
			kind: "line";
			key: string;
			type: DiffLineType;
			oldLineNumber: number | null;
			newLineNumber: number | null;
			text: string;
	  }
	| { kind: "truncated"; key: string; hiddenCount: number };

const CONTEXT_LINES = 3;
const MAX_ROWS = 2_000;

export function computeFileDiff(
	path: string,
	oldContents: string,
	newContents: string,
): DiffRow[] {
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
	let total = 0;
	for (const hunk of patch.hunks) {
		total += 1 + hunk.lines.length;
	}

	for (const hunk of patch.hunks) {
		if (rows.length >= MAX_ROWS) break;
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

	if (total > MAX_ROWS) {
		rows.push({
			kind: "truncated",
			key: `${path}@@truncated`,
			hiddenCount: total - MAX_ROWS,
		});
	}
	return rows;
}
