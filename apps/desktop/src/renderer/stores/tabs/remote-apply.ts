/**
 * Tracks whether the tabs store is currently applying a remote (cross-window)
 * state update. While true, the tRPC persistence adapter must drop writes —
 * the originating window already persisted this state, and echoing it back
 * would re-broadcast it in a loop.
 *
 * Standalone module (no store imports) so both the storage adapter and the
 * sync module can depend on it without cycles.
 */
let applyingRemoteTabsState = false;

export function isApplyingRemoteTabsState(): boolean {
	return applyingRemoteTabsState;
}

export function runWithRemoteTabsApply(fn: () => void): void {
	applyingRemoteTabsState = true;
	try {
		fn();
	} finally {
		applyingRemoteTabsState = false;
	}
}
