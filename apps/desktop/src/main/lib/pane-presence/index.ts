const paneClientsByPaneId = new Map<string, Set<number>>();

export function markPaneClientMounted(
	paneId: string,
	webContentsId: number,
): void {
	let clients = paneClientsByPaneId.get(paneId);
	if (!clients) {
		clients = new Set<number>();
		paneClientsByPaneId.set(paneId, clients);
	}
	clients.add(webContentsId);
}

export function markPaneClientUnmounted(
	paneId: string,
	webContentsId: number,
): void {
	const clients = paneClientsByPaneId.get(paneId);
	if (!clients) return;
	clients.delete(webContentsId);
	if (clients.size === 0) {
		paneClientsByPaneId.delete(paneId);
	}
}

export function hasOtherMountedPaneClient(
	paneId: string,
	callerWebContentsId: number,
): boolean {
	const clients = paneClientsByPaneId.get(paneId);
	if (!clients) return false;
	for (const clientWebContentsId of clients) {
		if (clientWebContentsId !== callerWebContentsId) {
			return true;
		}
	}
	return false;
}

export function cleanupPanePresenceForWebContents(webContentsId: number): void {
	for (const [paneId, clients] of paneClientsByPaneId.entries()) {
		clients.delete(webContentsId);
		if (clients.size === 0) {
			paneClientsByPaneId.delete(paneId);
		}
	}
}
