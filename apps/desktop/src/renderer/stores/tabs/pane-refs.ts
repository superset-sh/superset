const paneRefs = new Map<string, HTMLElement>();

export function registerPaneRef(paneId: string, element: HTMLElement) {
	paneRefs.set(paneId, element);
}

export function unregisterPaneRef(paneId: string) {
	paneRefs.delete(paneId);
}

export function getPaneDimensions(
	paneId: string,
): { width: number; height: number } | null {
	const element = paneRefs.get(paneId);
	if (!element) return null;
	const { width, height } = element.getBoundingClientRect();
	return { width, height };
}
