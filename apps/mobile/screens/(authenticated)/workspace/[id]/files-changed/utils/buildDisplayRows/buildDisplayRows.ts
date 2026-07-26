import type { ExpandedRange } from "../../../stores/diffViewStore";
import type { DiffRow, FileDiffData } from "../computeFileDiff";

interface Gap {
	newStart: number;
	newEnd: number;
	delta: number;
}

function computeGaps(data: FileDiffData): Gap[] {
	const gaps: Gap[] = [];
	const { hunks, newLineCount } = data;
	if (hunks.length === 0) return gaps;
	const first = hunks[0];
	if (first && first.newStart > 1) {
		gaps.push({
			newStart: 1,
			newEnd: first.newStart - 1,
			delta: first.newStart - first.oldStart,
		});
	}
	for (let index = 0; index < hunks.length; index++) {
		const hunk = hunks[index];
		if (!hunk) continue;
		const gapStart = hunk.newStart + hunk.newLines;
		const delta = gapStart - (hunk.oldStart + hunk.oldLines);
		const next = hunks[index + 1];
		const gapEnd = next ? next.newStart - 1 : newLineCount;
		if (gapEnd >= gapStart) {
			gaps.push({ newStart: gapStart, newEnd: gapEnd, delta });
		}
	}
	return gaps;
}

function synthesizedRows(
	path: string,
	data: FileDiffData,
	start: number,
	end: number,
	delta: number,
): DiffRow[] {
	const rows: DiffRow[] = [];
	for (let line = start; line <= end; line++) {
		rows.push({
			kind: "line",
			key: `${path}:ctx:${line}`,
			type: "context",
			oldLineNumber: line - delta,
			newLineNumber: line,
			text: data.newLines[line - 1] ?? "",
			tokens: data.newTokens?.[line - 1],
		});
	}
	return rows;
}

function gapRows(
	path: string,
	data: FileDiffData,
	gap: Gap,
	expansions: ExpandedRange[],
): DiffRow[] {
	const rows: DiffRow[] = [];
	let cursor = gap.newStart;
	const overlapping = expansions
		.filter(([start, end]) => end >= gap.newStart && start <= gap.newEnd)
		.sort((a, b) => a[0] - b[0]);
	for (const [start, end] of overlapping) {
		const clampedStart = Math.max(start, gap.newStart);
		const clampedEnd = Math.min(end, gap.newEnd);
		if (clampedStart > cursor) {
			rows.push({
				kind: "expander",
				key: `${path}:gap:${cursor}:${clampedStart - 1}`,
				path,
				gap: { newStart: cursor, newEnd: clampedStart - 1, delta: gap.delta },
			});
		}
		rows.push(
			...synthesizedRows(path, data, clampedStart, clampedEnd, gap.delta),
		);
		cursor = clampedEnd + 1;
	}
	if (cursor <= gap.newEnd) {
		rows.push({
			kind: "expander",
			key: `${path}:gap:${cursor}:${gap.newEnd}`,
			path,
			gap: { newStart: cursor, newEnd: gap.newEnd, delta: gap.delta },
		});
	}
	return rows;
}

/**
 * Interleave the base diff rows with expander rows and locally-synthesized
 * context for every expanded range. Pure — items rebuild from (cache, store)
 * state, so virtualization can never reset what the user expanded.
 */
export function buildDisplayRows(
	path: string,
	data: FileDiffData,
	expansions: ExpandedRange[],
): DiffRow[] {
	// Truncated diffs keep their base rows only; expansion math is unreliable
	// past the truncation point.
	if (data.truncated || data.hunks.length === 0) return data.rows;

	const gaps = computeGaps(data);
	const result: DiffRow[] = [];
	const leadingGap = gaps[0]?.newStart === 1 ? gaps[0] : null;
	if (leadingGap) result.push(...gapRows(path, data, leadingGap, expansions));

	let gapIndex = leadingGap ? 1 : 0;
	let hunkIndex = 0;
	for (const row of data.rows) {
		if (row.kind === "hunk") {
			if (hunkIndex > 0) {
				const gap = gaps[gapIndex];
				if (gap) {
					result.push(...gapRows(path, data, gap, expansions));
					gapIndex++;
				}
			}
			hunkIndex++;
		}
		result.push(row);
	}
	const trailingGap = gaps[gapIndex];
	if (trailingGap) result.push(...gapRows(path, data, trailingGap, expansions));
	return result;
}
