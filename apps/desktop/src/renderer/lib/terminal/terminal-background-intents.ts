const backgroundTerminalIds = new Set<string>();
const backgroundTerminalMarkersByWorkspace = new Map<string, Set<string>>();
const markerListeners = new Set<() => void>();

function emitMarkerChange(): void {
	for (const listener of markerListeners) {
		listener();
	}
}

function getWorkspaceMarkers(workspaceId: string): Set<string> {
	const existing = backgroundTerminalMarkersByWorkspace.get(workspaceId);
	if (existing) return existing;

	const markers = new Set<string>();
	backgroundTerminalMarkersByWorkspace.set(workspaceId, markers);
	return markers;
}

export function markTerminalForBackground(
	terminalId: string,
	workspaceId?: string,
): void {
	backgroundTerminalIds.add(terminalId);

	if (!workspaceId) return;

	const markers = getWorkspaceMarkers(workspaceId);
	if (markers.has(terminalId)) return;

	markers.add(terminalId);
	emitMarkerChange();
}

export function consumeTerminalBackgroundIntent(terminalId: string): boolean {
	return backgroundTerminalIds.delete(terminalId);
}

export function clearTerminalBackgroundMarker(
	workspaceId: string,
	terminalId: string,
): void {
	const markers = backgroundTerminalMarkersByWorkspace.get(workspaceId);
	if (!markers?.delete(terminalId)) return;

	if (markers.size === 0) {
		backgroundTerminalMarkersByWorkspace.delete(workspaceId);
	}
	emitMarkerChange();
}

export function getTerminalBackgroundMarkerIdsKey(workspaceId: string): string {
	const markers = backgroundTerminalMarkersByWorkspace.get(workspaceId);
	return JSON.stringify(markers ? [...markers].sort() : []);
}

export function subscribeTerminalBackgroundMarkers(
	listener: () => void,
): () => void {
	markerListeners.add(listener);
	return () => {
		markerListeners.delete(listener);
	};
}
