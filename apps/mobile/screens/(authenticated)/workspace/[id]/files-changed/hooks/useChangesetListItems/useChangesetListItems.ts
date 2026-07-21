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

interface HeaderCacheEntry {
	file: ChangesetFile;
	expanded: boolean;
	viewed: boolean;
	item: ListItem;
}

interface NoteCacheEntry {
	signature: string;
	item: ListItem;
}

interface CommentCacheEntry {
	comment: DraftComment;
	stale: boolean;
	orphaned: boolean;
	item: ListItem;
}

function placeholderHeight(file: ChangesetFile): number {
	const lines = file.additions + file.deletions + 8;
	return Math.min(Math.max(lines * DIFF_LINE_HEIGHT, NOTE_ROW_HEIGHT), 2_400);
}

/**
 * Assembles the flat item list from per-file cached blocks. A file's body is
 * rebuilt ONLY when its own data/expansions/comments references change, and
 * every item kind keeps a stable object identity across unrelated re-renders —
 * FlashList skips renderItem entirely for cells whose item reference is
 * unchanged, so toggling one file re-renders nothing else.
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
	const headerCacheRef = useRef(new Map<string, HeaderCacheEntry>());
	const noteCacheRef = useRef(new Map<string, NoteCacheEntry>());
	const commentCacheRef = useRef(new Map<string, CommentCacheEntry>());

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
		const headerCache = headerCacheRef.current;
		const noteCache = noteCacheRef.current;
		const commentCache = commentCacheRef.current;
		const items: ListItem[] = [];
		const stickyHeaderIndices: number[] = [];
		const placedIds = new Set<string>();
		const livePaths = new Set<string>();

		const commentItem = (
			comment: DraftComment,
			stale: boolean,
			orphaned: boolean,
		): ListItem => {
			const cached = commentCache.get(comment.id);
			if (
				cached &&
				cached.comment === comment &&
				cached.stale === stale &&
				cached.orphaned === orphaned
			) {
				return cached.item;
			}
			const item: ListItem = {
				kind: "comment",
				key: `comment:${comment.id}`,
				comment,
				stale,
				orphaned,
			};
			commentCache.set(comment.id, { comment, stale, orphaned, item });
			return item;
		};

		const noteItem = (
			path: string,
			note: "loading" | "error" | "binary",
			height: number,
		): ListItem => {
			const signature = `${note}:${height}`;
			const cached = noteCache.get(path);
			if (cached && cached.signature === signature) return cached.item;
			const item: ListItem = {
				kind: "note",
				key: `${path}:${note}`,
				path,
				note,
				height,
			};
			noteCache.set(path, { signature, item });
			return item;
		};

		for (const file of files) {
			livePaths.add(file.path);
			const expanded = isExpanded(file);
			stickyHeaderIndices.push(items.length);

			const cachedHeader = headerCache.get(file.path);
			if (
				cachedHeader &&
				cachedHeader.file === file &&
				cachedHeader.expanded === expanded &&
				cachedHeader.viewed === viewedSet.has(file.path)
			) {
				items.push(cachedHeader.item);
			} else {
				const viewed = viewedSet.has(file.path);
				const item: ListItem = {
					kind: "file",
					key: `file:${file.path}`,
					file,
					expanded,
					viewed,
				};
				headerCache.set(file.path, { file, expanded, viewed, item });
				items.push(item);
			}
			const fileComments = commentsByPath.get(file.path) ?? NO_FILE_COMMENTS;

			if (!expanded) {
				for (const comment of fileComments) {
					placedIds.add(comment.id);
					items.push(commentItem(comment, false, false));
				}
				continue;
			}
			if (file.isBinary === true) {
				items.push(noteItem(file.path, "binary", NOTE_ROW_HEIGHT));
				continue;
			}
			const entry = dataByPath.get(file.path);
			if (!entry?.data) {
				const isError = entry?.isError ?? false;
				items.push(
					isError
						? noteItem(file.path, "error", NOTE_ROW_HEIGHT)
						: noteItem(file.path, "loading", placeholderHeight(file)),
				);
				for (const comment of fileComments) {
					placedIds.add(comment.id);
					items.push(commentItem(comment, false, false));
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
		for (const path of headerCache.keys()) {
			if (!livePaths.has(path)) headerCache.delete(path);
		}
		for (const path of noteCache.keys()) {
			if (!livePaths.has(path)) noteCache.delete(path);
		}
		const liveCommentIds = new Set(comments.map((comment) => comment.id));
		for (const id of commentCache.keys()) {
			if (!liveCommentIds.has(id)) commentCache.delete(id);
		}
		for (const comment of comments) {
			if (placedIds.has(comment.id)) continue;
			items.push(commentItem(comment, true, true));
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
