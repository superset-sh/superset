// Global registry so CMD+D hotkey handler can access focused pane dimensions
// without prop-drilling refs through the component tree
const paneRefs = new Map<string, HTMLElement>();
const listenersByPaneId = new Map<string, Set<() => void>>();

function emitChange(paneId: string) {
	const listeners = listenersByPaneId.get(paneId);
	if (!listeners) return;
	for (const listener of listeners) {
		listener();
	}
}

export function registerPaneRef(paneId: string, element: HTMLElement) {
	paneRefs.set(paneId, element);
	emitChange(paneId);
}

export function unregisterPaneRef(paneId: string) {
	if (!paneRefs.delete(paneId)) return;
	emitChange(paneId);
}

export function getPaneRef(paneId: string): HTMLElement | null {
	return paneRefs.get(paneId) ?? null;
}

export function subscribePaneRef(
	paneId: string,
	listener: () => void,
): () => void {
	let listeners = listenersByPaneId.get(paneId);
	if (!listeners) {
		listeners = new Set();
		listenersByPaneId.set(paneId, listeners);
	}
	listeners.add(listener);
	return () => {
		const current = listenersByPaneId.get(paneId);
		if (!current) return;
		current.delete(listener);
		if (current.size === 0) {
			listenersByPaneId.delete(paneId);
		}
	};
}

export function getPaneDimensions(
	paneId: string,
): { width: number; height: number } | null {
	const element = getPaneRef(paneId);
	if (!element) return null;
	const { width, height } = element.getBoundingClientRect();
	return { width, height };
}
