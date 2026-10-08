import { hasOmittedBody } from "@superset/chat/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptRow } from "../../utils/transcriptRows";

const NEAR_MARGIN = "800px 0px";

function omittedBodyIds(row: TranscriptRow): string[] {
	const items =
		row.kind === "tool_run" ? row.items : row.kind === "item" ? [row.item] : [];
	return items.filter(hasOmittedBody).map((item) => item.id);
}

export function useNearRows(
	rows: readonly TranscriptRow[],
	root: HTMLElement | null,
	requestItemBodies: (itemIds: readonly string[]) => void,
): {
	seenRowKeys: ReadonlySet<string>;
	observeRow: (rowKey: string) => (element: HTMLElement | null) => void;
} {
	const idsByKey = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const row of rows) {
			const ids = omittedBodyIds(row);
			if (ids.length > 0) map.set(row.key, ids);
		}
		return map;
	}, [rows]);
	const requestRef = useRef(requestItemBodies);
	requestRef.current = requestItemBodies;
	const [seenRowKeys, setSeenRowKeys] = useState<ReadonlySet<string>>(
		() => new Set(),
	);

	const elements = useRef(new Map<string, HTMLElement>());
	const observerRef = useRef<IntersectionObserver | null>(null);

	useEffect(() => {
		if (!root) return;
		const observer = new IntersectionObserver(
			(entries) => {
				setSeenRowKeys((previous) => {
					let next: Set<string> | null = null;
					for (const entry of entries) {
						const key = (entry.target as HTMLElement).dataset.rowKey;
						if (!key || !entry.isIntersecting || previous.has(key)) continue;
						next ??= new Set(previous);
						next.add(key);
					}
					return next ?? previous;
				});
			},
			{ root, rootMargin: NEAR_MARGIN },
		);
		observerRef.current = observer;
		for (const element of elements.current.values()) observer.observe(element);
		return () => {
			observer.disconnect();
			observerRef.current = null;
		};
	}, [root]);

	useEffect(() => {
		const ids = [...seenRowKeys].flatMap((key) => idsByKey.get(key) ?? []);
		if (ids.length > 0) requestRef.current(ids);
	}, [idsByKey, seenRowKeys]);

	const refs = useRef(new Map<string, (element: HTMLElement | null) => void>());
	const observeRow = useCallback((rowKey: string) => {
		const cached = refs.current.get(rowKey);
		if (cached) return cached;
		const ref = (element: HTMLElement | null) => {
			const previous = elements.current.get(rowKey);
			if (previous === element) return;
			if (previous) observerRef.current?.unobserve(previous);
			if (!element) {
				elements.current.delete(rowKey);
				refs.current.delete(rowKey);
				setSeenRowKeys((keys) => {
					if (!keys.has(rowKey)) return keys;
					const next = new Set(keys);
					next.delete(rowKey);
					return next;
				});
				return;
			}
			element.dataset.rowKey = rowKey;
			elements.current.set(rowKey, element);
			observerRef.current?.observe(element);
		};
		refs.current.set(rowKey, ref);
		return ref;
	}, []);

	return { seenRowKeys, observeRow };
}
