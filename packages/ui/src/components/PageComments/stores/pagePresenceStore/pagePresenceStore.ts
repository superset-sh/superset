import { useCallback, useSyncExternalStore } from "react";

export interface PageViewer {
	id: string;
	name: string;
	image: string | null;
	color: string;
}

const NONE: PageViewer[] = [];
const viewersByPage = new Map<string, PageViewer[]>();
const listeners = new Set<() => void>();

export function setPageViewers(pageId: string, viewers: PageViewer[]): void {
	if (viewers.length === 0) viewersByPage.delete(pageId);
	else viewersByPage.set(pageId, viewers);
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function usePageViewers(pageId: string | undefined): PageViewer[] {
	const read = useCallback(
		() => (pageId ? (viewersByPage.get(pageId) ?? NONE) : NONE),
		[pageId],
	);
	return useSyncExternalStore(subscribe, read, () => NONE);
}
