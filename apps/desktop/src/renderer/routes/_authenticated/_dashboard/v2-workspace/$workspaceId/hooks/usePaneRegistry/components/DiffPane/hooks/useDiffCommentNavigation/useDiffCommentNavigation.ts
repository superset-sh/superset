import type { CodeViewItem } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { type RefObject, useCallback, useMemo, useState } from "react";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";
import { buildOrderedThreads } from "./buildOrderedThreads";

interface UseDiffCommentNavigationOptions {
	codeViewRef: RefObject<CodeViewHandle<DiffAnnotationMetadata> | null>;
	items: readonly CodeViewItem<DiffAnnotationMetadata>[];
	fileByItemId: ReadonlyMap<string, ChangesetFile>;
	collapsedSet: ReadonlySet<string>;
	setCollapsed: (changeKey: string, value: boolean) => void;
}

/**
 * Prev/next navigation over the review threads rendered in the diff, for the
 * toolbar's comment cluster. Mirrors the PR Code tab's navigation: threads
 * ordered in diff order, focus tracked by thread id (indices go stale when a
 * background refetch reorders threads), and a tick that tells the focused
 * CommentThread to force-expand even when it rendered collapsed
 * (resolved/outdated).
 */
export function useDiffCommentNavigation({
	codeViewRef,
	items,
	fileByItemId,
	collapsedSet,
	setCollapsed,
}: UseDiffCommentNavigationOptions) {
	const orderedThreads = useMemo(() => buildOrderedThreads(items), [items]);
	const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);
	const [navFocusTick, setNavFocusTick] = useState(0);
	// Before any navigation (or after a refetch dropped the focused thread)
	// the counter reads as the first thread rather than "–": the next click
	// then advances from there instead of the position looking undefined.
	const focusedThreadIndex = useMemo(() => {
		if (orderedThreads.length === 0) return null;
		if (focusedThreadId == null) return 0;
		const index = orderedThreads.findIndex(
			(t) => t.threadId === focusedThreadId,
		);
		return index === -1 ? 0 : index;
	}, [orderedThreads, focusedThreadId]);

	const jumpToThread = useCallback(
		(index: number) => {
			const target = orderedThreads[index];
			if (!target) return;
			setFocusedThreadId(target.threadId);
			setNavFocusTick(Date.now());
			const scroll = () => {
				if (target.itemType === "file") {
					// Binary placeholder: a single synthetic line — item scroll.
					codeViewRef.current?.scrollTo({
						type: "item",
						id: target.itemId,
						align: "start",
						behavior: "smooth-auto",
					});
					return;
				}
				codeViewRef.current?.scrollTo({
					type: "line",
					id: target.itemId,
					lineNumber: target.lineNumber,
					...(target.side ? { side: target.side } : {}),
					align: "center",
					behavior: "smooth-auto",
				});
			};
			// A collapsed file has no body to land a line scroll in — expand it
			// and give Pierre a frame to process the version bump first.
			const file = fileByItemId.get(target.itemId);
			const changeKey = file ? getChangesetFileKey(file) : null;
			if (changeKey != null && collapsedSet.has(changeKey)) {
				setCollapsed(changeKey, false);
				requestAnimationFrame(scroll);
				return;
			}
			scroll();
		},
		[orderedThreads, fileByItemId, collapsedSet, setCollapsed, codeViewRef],
	);

	// Virgin state keys off the id, not the derived index: the counter shows
	// the first thread by default, but the first "next" click should scroll
	// to that thread, not skip past it.
	const goToNextComment = useCallback(() => {
		if (orderedThreads.length === 0) return;
		jumpToThread(
			focusedThreadId == null
				? 0
				: ((focusedThreadIndex ?? 0) + 1) % orderedThreads.length,
		);
	}, [
		orderedThreads.length,
		focusedThreadId,
		focusedThreadIndex,
		jumpToThread,
	]);

	const goToPrevComment = useCallback(() => {
		if (orderedThreads.length === 0) return;
		jumpToThread(
			focusedThreadId == null
				? orderedThreads.length - 1
				: ((focusedThreadIndex ?? 0) - 1 + orderedThreads.length) %
						orderedThreads.length,
		);
	}, [
		orderedThreads.length,
		focusedThreadId,
		focusedThreadIndex,
		jumpToThread,
	]);

	const isNavFocused = useCallback(
		(threadId: string) => focusedThreadId === threadId,
		[focusedThreadId],
	);

	return {
		orderedThreads,
		focusedThreadIndex,
		navFocusTick,
		isNavFocused,
		goToNextComment,
		goToPrevComment,
	};
}
