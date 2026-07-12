import { useMemo, useRef } from "react";
import type { ChangesetFile } from "../../../hooks/useWorkspaceChangeset";
import type { ExpandedRange } from "../../../stores/diffViewStore";
import type { DraftComment } from "../../../stores/draftCommentsStore";
import {
	buildFileBodyItems,
	type ListItem,
	sameArrayShallow,
} from "../../utils/buildListItems";
import type { FileDiffData } from "../../utils/computeFileDiff";
import { DIFF_LINE_HEIGHT, NOTE_ROW_HEIGHT } from "../../utils/diffMetrics";

const NO_EXPANDED_RANGES: ExpandedRange[] = [];
const NO_FILE_COMMENTS: DraftComment[] = [];

interface CacheEntry {
	data: FileDiffData;
	expansions: ExpandedRange[];
	comments: DraftComment[];
	items: ListItem[];
	placedCommentIds: ReadonlySet<string>;
}

function placeholderHeight(file: ChangesetFile): number {
	const lines = file.additions + file.deletions + 8;
	return Math.min(Math.max(lines * DIFF_LINE_HEIGHT, NOTE_ROW_HEIGHT), 2_400);
}

/**
 * Assembles the flat item list from per-file cached blocks. A file's body is
 * rebuilt ONLY when its own data/expansions/comments references change —
 * toggling one file never recomputes another, and unchanged files keep
 * identical item references so the list re-renders nothing for them.
 */
export function useChangesetListItems(args: {
	files: ChangesetFile[];
	dataByPath: Map<string, { data: FileDiffData | null; isError: boolean }>;
	expansions: Record<string, ExpandedRange[]>;
	comments: DraftComment[];
	isExpanded: (file: ChangesetFile) => boolean;
	viewedSet: ReadonlySet<string>;
}): { items: ListItem[]; stickyHeaderIndices: number[] } {
	const { files, dataByPath, expansions, comments, isExpanded, viewedSet } =
		args;
	const cacheRef = useRef(new Map<string, CacheEntry>());

	const commentsByPath = useMemo(() => {
		const map = new Map<string, DraftComment[]>();
		for (const comment of comments) {
			const group = map.get(comment.path);
			if (group) group.push(comment);
			else map.set(comment.path, [comment]);
		}
		return map;
	}, [comments]);

	return useMemo(() => {
		const cache = cacheRef.current;
		const items: ListItem[] = [];
		const stickyHeaderIndices: number[] = [];
		const placedIds = new Set<string>();
		const livePaths = new Set<string>();

		for (const file of files) {
			livePaths.add(file.path);
			const expanded = isExpanded(file);
			stickyHeaderIndices.push(items.length);
			items.push({
				kind: "file",
				key: `file:${file.path}`,
				file,
				expanded,
				viewed: viewedSet.has(file.path),
			});
			const fileComments = commentsByPath.get(file.path) ?? NO_FILE_COMMENTS;

			if (!expanded) {
				for (const comment of fileComments) {
					placedIds.add(comment.id);
					items.push({
						kind: "comment",
						key: `comment:${comment.id}`,
						comment,
						stale: false,
						orphaned: false,
					});
				}
				continue;
			}
			if (file.isBinary === true) {
				items.push({
					kind: "note",
					key: `${file.path}:binary`,
					path: file.path,
					note: "binary",
					height: NOTE_ROW_HEIGHT,
				});
				continue;
			}
			const entry = dataByPath.get(file.path);
			if (!entry?.data) {
				const isError = entry?.isError ?? false;
				items.push({
					kind: "note",
					key: `${file.path}:${isError ? "error" : "loading"}`,
					path: file.path,
					note: isError ? "error" : "loading",
					height: isError ? NOTE_ROW_HEIGHT : placeholderHeight(file),
				});
				for (const comment of fileComments) {
					placedIds.add(comment.id);
					items.push({
						kind: "comment",
						key: `comment:${comment.id}`,
						comment,
						stale: false,
						orphaned: false,
					});
				}
				continue;
			}

			const fileExpansions = expansions[file.path] ?? NO_EXPANDED_RANGES;
			const cached = cache.get(file.path);
			let block: CacheEntry;
			if (
				cached &&
				cached.data === entry.data &&
				cached.expansions === fileExpansions &&
				sameArrayShallow(cached.comments, fileComments)
			) {
				block = cached;
			} else {
				const built = buildFileBodyItems({
					path: file.path,
					data: entry.data,
					expansions: fileExpansions,
					fileComments,
				});
				block = {
					data: entry.data,
					expansions: fileExpansions,
					comments: fileComments,
					items: built.items,
					placedCommentIds: built.placedCommentIds,
				};
				cache.set(file.path, block);
			}
			for (const id of block.placedCommentIds) placedIds.add(id);
			items.push(...block.items);
		}

		for (const path of cache.keys()) {
			if (!livePaths.has(path)) cache.delete(path);
		}
		for (const comment of comments) {
			if (placedIds.has(comment.id)) continue;
			items.push({
				kind: "comment",
				key: `comment:${comment.id}`,
				comment,
				stale: true,
				orphaned: true,
			});
		}
		return { items, stickyHeaderIndices };
	}, [
		files,
		dataByPath,
		expansions,
		comments,
		commentsByPath,
		isExpanded,
		viewedSet,
	]);
}
