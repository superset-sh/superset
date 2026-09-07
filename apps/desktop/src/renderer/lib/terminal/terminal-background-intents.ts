const backgroundTerminalIds = new Set<string>();
const handoffTerminalIds = new Set<string>();
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

/**
 * The pane about to close is not this terminal's last: another pane in the
 * workspace already shows it, so closing must neither kill the session nor
 * release its runtime — the surviving pane owns both.
 */
export function markTerminalForHandoff(terminalId: string): void {
	handoffTerminalIds.add(terminalId);
}

export function consumeTerminalHandoffIntent(terminalId: string): boolean {
	return handoffTerminalIds.delete(terminalId);
}

/** Non-consuming check — is this terminal about to be backgrounded (kept alive) rather than killed? */
export function hasTerminalBackgroundIntent(terminalId: string): boolean {
	return backgroundTerminalIds.has(terminalId);
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
