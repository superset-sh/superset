import type { ChangesetFile } from "../../../hooks/useWorkspaceChangeset";
import type { ExpandedRange } from "../../../stores/diffViewStore";
import type { DraftComment } from "../../../stores/draftCommentsStore";
import { buildDisplayRows } from "../buildDisplayRows";
import type { DiffRow, FileDiffData } from "../computeFileDiff";
import { DIFF_LINE_HEIGHT } from "../diffMetrics";

export type LineRow = Extract<DiffRow, { kind: "line" }>;
type ExpanderDiffRow = Extract<DiffRow, { kind: "expander" }>;

export const MAX_SEGMENT_LINES = 80;

export interface HunkSegment {
	key: string;
	path: string;
	lines: LineRow[];
	height: number;
	hasTokens: boolean;
}

export type ListItem =
	| {
			kind: "file";
			key: string;
			file: ChangesetFile;
			expanded: boolean;
			viewed: boolean;
	  }
	| { kind: "hunk"; key: string; path: string; header: string }
	| { kind: "segment"; key: string; path: string; segment: HunkSegment }
	| { kind: "expander"; key: string; path: string; row: ExpanderDiffRow }
	| { kind: "truncated"; key: string; hiddenCount: number }
	| {
			kind: "comment";
			key: string;
			comment: DraftComment;
			stale: boolean;
			orphaned: boolean;
	  }
	| {
			kind: "note";
			key: string;
			path: string;
			note: "loading" | "error" | "binary";
			height: number;
	  };

export function sameArrayShallow<T>(a: readonly T[], b: readonly T[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) {
		if (a[index] !== b[index]) return false;
	}
	return true;
}

export function buildFileBodyItems(args: {
	path: string;
	data: FileDiffData;
	expansions: ExpandedRange[];
	fileComments: DraftComment[];
}): { items: ListItem[]; placedCommentIds: ReadonlySet<string> } {
	const { path, data, expansions, fileComments } = args;
	const rows = buildDisplayRows(path, data, expansions);
	const items: ListItem[] = [];
	const placed = new Set<string>();

	// Anchor lookup: side:line → comments, so segments can split on anchors.
	const anchors = new Map<string, DraftComment[]>();
	for (const comment of fileComments) {
		if (comment.line === 0) continue;
		const anchorKey = `${comment.side}:${comment.line}`;
		const group = anchors.get(anchorKey);
		if (group) group.push(comment);
		else anchors.set(anchorKey, [comment]);
	}

	// File-level comments (line 0) come first, right under the header.
	for (const comment of fileComments) {
		if (comment.line !== 0) continue;
		placed.add(comment.id);
		items.push({
			kind: "comment",
			key: `comment:${comment.id}`,
			comment,
			stale: false,
			orphaned: false,
		});
	}

	let pending: LineRow[] = [];
	const flush = () => {
		if (pending.length === 0) return;
		const first = pending[0] as LineRow;
		const hasTokens = pending.some((line) => line.tokens !== undefined);
		items.push({
			kind: "segment",
			key: `seg:${first.key}:${pending.length}:${hasTokens ? 1 : 0}`,
			path,
			segment: {
				key: `seg:${first.key}:${pending.length}:${hasTokens ? 1 : 0}`,
				path,
				lines: pending,
				height: pending.length * DIFF_LINE_HEIGHT,
				hasTokens,
			},
		});
		pending = [];
	};

	for (const row of rows) {
		if (row.kind === "hunk") {
			flush();
			items.push({ kind: "hunk", key: row.key, path, header: row.header });
			continue;
		}
		if (row.kind === "expander") {
			flush();
			items.push({ kind: "expander", key: row.key, path, row });
			continue;
		}
		if (row.kind === "truncated") {
			flush();
			items.push({
				kind: "truncated",
				key: row.key,
				hiddenCount: row.hiddenCount,
			});
			continue;
		}
		pending.push(row);
		const anchorSide = row.type === "del" ? "old" : "new";
		const anchorLine =
			anchorSide === "old" ? row.oldLineNumber : row.newLineNumber;
		const anchored = anchorLine
			? anchors.get(`${anchorSide}:${anchorLine}`)
			: undefined;
		if (anchored) {
			flush();
			for (const comment of anchored) {
				if (placed.has(comment.id)) continue;
				placed.add(comment.id);
				items.push({
					kind: "comment",
					key: `comment:${comment.id}`,
					comment,
					stale: comment.lineText !== row.text,
					orphaned: false,
				});
			}
		} else if (pending.length >= MAX_SEGMENT_LINES) {
			flush();
		}
	}
	flush();

	// Unplaced anchors: the line left the diff — keep the draft visible.
	for (const comment of fileComments) {
		if (placed.has(comment.id)) continue;
		placed.add(comment.id);
		items.push({
			kind: "comment",
			key: `comment:${comment.id}`,
			comment,
			stale: true,
			orphaned: false,
		});
	}

	return { items, placedCommentIds: placed };
}
