import type { CodeViewItem } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ChangesetFile } from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

type GroupKind = ChangesetFile["source"]["kind"];

export interface DiffSection {
	kind: GroupKind;
	count: number;
}

interface UseDiffActiveSectionOptions {
	codeViewRef: RefObject<CodeViewHandle<DiffAnnotationMetadata> | null>;
	items: CodeViewItem<DiffAnnotationMetadata>[];
	fileByItemId: ReadonlyMap<string, ChangesetFile>;
	files: ChangesetFile[];
}

interface UseDiffActiveSectionResult {
	/** Source group of the topmost visible file, for the pinned section bar. */
	currentSection: DiffSection | null;
	/** Wire to CodeView's `onScroll`. */
	onScroll: () => void;
}

/**
 * Tracks which source group (unstaged / staged / committed …) the topmost
 * visible file belongs to, so the diff pane can pin a single section bar and
 * update it as the user scrolls across group boundaries.
 */
export function useDiffActiveSection({
	codeViewRef,
	items,
	fileByItemId,
	files,
}: UseDiffActiveSectionOptions): UseDiffActiveSectionResult {
	const { sectionByItemId, firstSection } = useMemo(() => {
		const counts = new Map<GroupKind, number>();
		for (const file of files) {
			counts.set(file.source.kind, (counts.get(file.source.kind) ?? 0) + 1);
		}
		const byItemId = new Map<string, DiffSection>();
		let first: DiffSection | null = null;
		for (const item of items) {
			const kind = fileByItemId.get(item.id)?.source.kind;
			if (!kind) continue;
			const entry: DiffSection = { kind, count: counts.get(kind) ?? 0 };
			byItemId.set(item.id, entry);
			first ??= entry;
		}
		return { sectionByItemId: byItemId, firstSection: first };
	}, [items, fileByItemId, files]);

	const [topItemId, setTopItemId] = useState<string | null>(null);
	const currentSection =
		(topItemId != null ? sectionByItemId.get(topItemId) : undefined) ??
		firstSection;

	// Track the topmost item by geometry rather than `getRenderedItems()[0]`,
	// which can lag by the virtualization buffer. Items stack top→bottom, so the
	// last one whose top has passed the viewport top is the pinned header. A
	// linear scan (one item per changed file — few) stays correct even while
	// some items are momentarily unmeasured mid-reflow, where a binary search
	// could discard the visible half on a `null` midpoint.
	const rafRef = useRef<number | null>(null);
	const updateActiveSection = useCallback(() => {
		rafRef.current = null;
		const instance = codeViewRef.current?.getInstance();
		if (!instance) return;
		const scrollTop = instance.getScrollTop();
		let nextTopId: string | null = null;
		for (const item of items) {
			const top = instance.getTopForItem(item.id);
			if (top == null) continue;
			if (top > scrollTop + 1) break;
			nextTopId = item.id;
		}
		setTopItemId((prev) => (prev === nextTopId ? prev : nextTopId));
	}, [codeViewRef, items]);

	// Coalesce bursts of scroll events into one measurement per frame.
	const onScroll = useCallback(() => {
		if (rafRef.current != null) return;
		rafRef.current = requestAnimationFrame(updateActiveSection);
	}, [updateActiveSection]);

	// Resync when the item list changes (collapse, filter, changeset update)
	// even without a scroll, and drop any frame queued against the old list —
	// `updateActiveSection` is recreated whenever `items` change.
	useEffect(() => {
		updateActiveSection();
		return () => {
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
		};
	}, [updateActiveSection]);

	return { currentSection, onScroll };
}
