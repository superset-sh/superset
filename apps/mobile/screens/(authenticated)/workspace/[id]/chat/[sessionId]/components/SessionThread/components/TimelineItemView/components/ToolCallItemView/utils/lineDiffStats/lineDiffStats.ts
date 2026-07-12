import type { JsonValue } from "@superset/host-service-sync/protocol";

export interface LineDiffStats {
	additions: number;
	deletions: number;
}

/** Past this the strings aren't worth diffing on the UI thread. */
const MAX_DIFF_CHARS = 2_000_000;

/**
 * Git-style `+N −M` line counts for a file-editing tool call, derived from
 * the tool INPUT (the canonical log carries no patch). For a single
 * contiguous edit — the overwhelmingly common shape — trimming the common
 * prefix/suffix lines gives exactly the numbers git would report; scattered
 * multi-hunk old/new strings degrade to a slight overcount, never an error.
 * Returns null for non-file tools or inputs that don't parse.
 */
export function lineDiffStats(
	toolName: string,
	input: JsonValue,
): LineDiffStats | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return null;
	}
	const record = input as Record<string, JsonValue>;
	switch (toolName) {
		case "Write": {
			const content = record.content;
			if (typeof content !== "string" || content.length > MAX_DIFF_CHARS) {
				return null;
			}
			return { additions: countLines(content), deletions: 0 };
		}
		case "Edit": {
			return pairStats(record.old_string, record.new_string);
		}
		case "MultiEdit": {
			const edits = record.edits;
			if (!Array.isArray(edits)) return null;
			let additions = 0;
			let deletions = 0;
			let sawAny = false;
			for (const edit of edits) {
				if (typeof edit !== "object" || edit === null || Array.isArray(edit)) {
					continue;
				}
				const editRecord = edit as Record<string, JsonValue>;
				const stats = pairStats(editRecord.old_string, editRecord.new_string);
				if (!stats) continue;
				sawAny = true;
				additions += stats.additions;
				deletions += stats.deletions;
			}
			return sawAny ? { additions, deletions } : null;
		}
		default:
			return null;
	}
}

function pairStats(
	oldValue: JsonValue | undefined,
	newValue: JsonValue | undefined,
): LineDiffStats | null {
	if (typeof oldValue !== "string" || typeof newValue !== "string") {
		return null;
	}
	if (oldValue.length + newValue.length > MAX_DIFF_CHARS) return null;
	const oldLines = oldValue.split("\n");
	const newLines = newValue.split("\n");
	let prefix = 0;
	while (
		prefix < oldLines.length &&
		prefix < newLines.length &&
		oldLines[prefix] === newLines[prefix]
	) {
		prefix += 1;
	}
	let suffix = 0;
	while (
		suffix < oldLines.length - prefix &&
		suffix < newLines.length - prefix &&
		oldLines[oldLines.length - 1 - suffix] ===
			newLines[newLines.length - 1 - suffix]
	) {
		suffix += 1;
	}
	return {
		additions: newLines.length - prefix - suffix,
		deletions: oldLines.length - prefix - suffix,
	};
}

/** Line count the way git reports it: a trailing newline ends the last line
 * instead of starting an empty one. */
function countLines(content: string): number {
	if (content === "") return 0;
	return content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
}
