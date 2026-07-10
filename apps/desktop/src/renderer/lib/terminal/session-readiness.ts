type SessionReadyWaiter = {
	resolve: () => void;
	reject: (error: Error) => void;
};

const readyPaneIds = new Set<string>();
const waitersByPaneId = new Map<string, Set<SessionReadyWaiter>>();

function resolveWaiters(paneId: string): void {
	const waiters = waitersByPaneId.get(paneId);
	if (!waiters) return;
	waitersByPaneId.delete(paneId);
	for (const waiter of waiters) {
		waiter.resolve();
	}
}

function rejectWaiters(paneId: string, error: Error): void {
	const waiters = waitersByPaneId.get(paneId);
	if (!waiters) return;
	waitersByPaneId.delete(paneId);
	for (const waiter of waiters) {
		waiter.reject(error);
	}
}

export function clearTerminalSessionReady(paneId: string): void {
	readyPaneIds.delete(paneId);
}

export function markTerminalSessionReady(paneId: string): void {
	readyPaneIds.add(paneId);
	resolveWaiters(paneId);
}

export function rejectTerminalSessionReady(paneId: string, error: Error): void {
	readyPaneIds.delete(paneId);
	rejectWaiters(paneId, error);
}

export function waitForTerminalSessionReady(paneId: string): Promise<void> {
	if (readyPaneIds.has(paneId)) {
		return Promise.resolve();
	}

	return new Promise<void>((resolve, reject) => {
		let waiters = waitersByPaneId.get(paneId);
		if (!waiters) {
			waiters = new Set();
			waitersByPaneId.set(paneId, waiters);
		}
		waiters.add({ resolve, reject });
	});
}
