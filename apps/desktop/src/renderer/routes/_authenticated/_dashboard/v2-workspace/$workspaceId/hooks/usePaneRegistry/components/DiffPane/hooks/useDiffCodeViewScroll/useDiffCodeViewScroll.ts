import type { CodeViewItem, CodeViewScrollTarget } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import type { DiffPaneData } from "../../../../../../types";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

interface UseDiffCodeViewScrollOptions {
	codeViewRef: RefObject<CodeViewHandle<DiffAnnotationMetadata> | null>;
	data: DiffPaneData;
	fileByItemId: ReadonlyMap<string, ChangesetFile>;
	items: CodeViewItem<DiffAnnotationMetadata>[];
	collapsedSet: ReadonlySet<string>;
	setCollapsed: (path: string, value: boolean) => void;
}

interface UseDiffCodeViewScrollResult {
	targetItemId?: string;
}

export function useDiffCodeViewScroll({
	codeViewRef,
	data,
	fileByItemId,
	items,
	collapsedSet,
	setCollapsed,
}: UseDiffCodeViewScrollOptions): UseDiffCodeViewScrollResult {
	const lastScrollTargetRef = useRef<string | null>(null);
	const itemById = useMemo(() => {
		const map = new Map<string, CodeViewItem<DiffAnnotationMetadata>>();
		for (const item of items) {
			map.set(item.id, item);
		}
		return map;
	}, [items]);
	// Prefer the change key (disambiguates a path that appears in several source
	// groups). Fall back to matching on path for diff panes persisted before
	// change-key tracking, which only carry `path`.
	const targetItemId = useMemo(() => {
		if (data.changeKey) return `diff:${data.changeKey}`;
		if (!data.path) return undefined;
		for (const item of items) {
			if (fileByItemId.get(item.id)?.path === data.path) return item.id;
		}
		return undefined;
	}, [data.changeKey, data.path, items, fileByItemId]);

	useEffect(() => {
		if (!targetItemId) return;
		const file = fileByItemId.get(targetItemId);
		if (!file) return;
		if (!itemById.has(targetItemId)) return;
		const changeKey = getChangesetFileKey(file);
		if (collapsedSet.has(changeKey)) {
			setCollapsed(changeKey, false);
			return;
		}

		const scrollKey = [
			targetItemId,
			data.focusLine ?? "",
			data.focusSide ?? "",
			data.focusTick ?? "",
		].join(":");
		if (lastScrollTargetRef.current === scrollKey) return;

		const targetItem = itemById.get(targetItemId);
		const target: CodeViewScrollTarget =
			data.focusLine != null && targetItem?.type === "diff"
				? {
						type: "line",
						id: targetItemId,
						lineNumber: data.focusLine,
						side: data.focusSide,
						align: "center",
						behavior: "smooth-auto",
					}
				: {
						type: "item",
						id: targetItemId,
						align: "start",
						behavior: "smooth-auto",
					};

		codeViewRef.current?.scrollTo(target);
		lastScrollTargetRef.current = scrollKey;
	}, [
		codeViewRef,
		data.focusLine,
		data.focusSide,
		data.focusTick,
		targetItemId,
		fileByItemId,
		itemById,
		collapsedSet,
		setCollapsed,
	]);

	return { targetItemId };
}
