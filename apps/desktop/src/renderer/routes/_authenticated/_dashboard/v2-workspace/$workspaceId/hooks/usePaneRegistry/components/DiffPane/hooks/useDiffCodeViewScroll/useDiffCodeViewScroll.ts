import type { CodeViewItem, CodeViewScrollTarget } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import type { DiffPaneData } from "../../../../../../types";
import type { ChangesetFile } from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

interface UseDiffCodeViewScrollOptions {
	codeViewRef: RefObject<CodeViewHandle<DiffAnnotationMetadata> | null>;
	data: DiffPaneData;
	fileByItemId: ReadonlyMap<string, ChangesetFile>;
	pathToItemId: ReadonlyMap<string, string>;
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
	pathToItemId,
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
	const targetItemId = data.path ? pathToItemId.get(data.path) : undefined;

	useEffect(() => {
		if (!data.path || !targetItemId) return;
		const file = fileByItemId.get(targetItemId);
		if (!file) return;
		if (!itemById.has(targetItemId)) return;
		if (collapsedSet.has(file.path)) {
			setCollapsed(file.path, false);
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
		data.path,
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
