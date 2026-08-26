import { useCallback, useSyncExternalStore } from "react";

interface PagePaneUiState {
	commentsEnabled: boolean;
	shareOpen: boolean;
}

const EMPTY: PagePaneUiState = { commentsEnabled: false, shareOpen: false };

const states = new Map<string, PagePaneUiState>();
const listeners = new Map<string, Set<() => void>>();

function subscribe(paneId: string, listener: () => void): () => void {
	let set = listeners.get(paneId);
	if (!set) {
		set = new Set();
		listeners.set(paneId, set);
	}
	set.add(listener);
	return () => {
		set.delete(listener);
		if (set.size === 0) {
			listeners.delete(paneId);
			states.delete(paneId);
		}
	};
}

function patch(paneId: string, next: Partial<PagePaneUiState>): void {
	states.set(paneId, { ...(states.get(paneId) ?? EMPTY), ...next });
	for (const listener of listeners.get(paneId) ?? []) listener();
}

export function usePagePaneUi(paneId: string) {
	const state = useSyncExternalStore(
		useCallback((listener) => subscribe(paneId, listener), [paneId]),
		useCallback(() => states.get(paneId) ?? EMPTY, [paneId]),
		useCallback(() => EMPTY, []),
	);

	return {
		commentsEnabled: state.commentsEnabled,
		shareOpen: state.shareOpen,
		setCommentsEnabled: useCallback(
			(commentsEnabled: boolean) => patch(paneId, { commentsEnabled }),
			[paneId],
		),
		setShareOpen: useCallback(
			(shareOpen: boolean) => patch(paneId, { shareOpen }),
			[paneId],
		),
	};
}
