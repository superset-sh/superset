import { useCallback, useSyncExternalStore } from "react";

export interface PageViewer {
	id: string;
	name: string;
	image: string | null;
	color: string;
}

const NONE: PageViewer[] = [];
const viewsByPage = new Map<string, Map<symbol, PageViewer[]>>();
const merged = new Map<string, PageViewer[]>();
const listeners = new Set<() => void>();

export function setPageViewers(
	pageId: string,
	view: symbol,
	viewers: PageViewer[],
): void {
	const views = viewsByPage.get(pageId) ?? new Map<symbol, PageViewer[]>();
	if (viewers.length === 0) views.delete(view);
	else views.set(view, viewers);
	if (views.size === 0) viewsByPage.delete(pageId);
	else viewsByPage.set(pageId, views);

	const byId = new Map<string, PageViewer>();
	for (const list of views.values()) {
		for (const viewer of list) byId.set(viewer.id, viewer);
	}
	if (byId.size === 0) merged.delete(pageId);
	else merged.set(pageId, [...byId.values()]);
	for (const listener of listeners) listener();
}

export function readPageViewers(pageId: string | undefined): PageViewer[] {
	return pageId ? (merged.get(pageId) ?? NONE) : NONE;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function usePageViewers(pageId: string | undefined): PageViewer[] {
	const read = useCallback(() => readPageViewers(pageId), [pageId]);
	return useSyncExternalStore(subscribe, read, () => NONE);
}
