import { electronTrpcClient } from "../../../lib/trpc-client";

/**
 * Soft-close delay: terminal sessions are kept alive for this duration after
 * a pane/tab is closed, allowing "reopen closed tab" (Cmd+Shift+R) to restore
 * the live session with full scrollback and running processes.
 */
const SOFT_CLOSE_DELAY_MS = 60_000;

const pendingKills = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a terminal kill after SOFT_CLOSE_DELAY_MS.
 * Used by removeTab/removePane so the session stays alive for reopening.
 */
export const scheduleKillTerminalForPane = (paneId: string): void => {
	cancelPendingKill(paneId);

	const timer = setTimeout(() => {
		pendingKills.delete(paneId);
		electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
			console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
		});
	}, SOFT_CLOSE_DELAY_MS);

	pendingKills.set(paneId, timer);
};

/**
 * Cancel a pending soft-close kill.
 * Returns true if a pending kill was cancelled (session is still alive).
 */
export const cancelPendingKill = (paneId: string): boolean => {
	const timer = pendingKills.get(paneId);
	if (timer) {
		clearTimeout(timer);
		pendingKills.delete(paneId);
		return true;
	}
	return false;
};

/**
 * Immediately kill a terminal session (no delay).
 * Used for explicit destroy cases (e.g., pane destroyed while component unmounts).
 */
export const killTerminalForPane = (paneId: string): void => {
	cancelPendingKill(paneId);
	electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};

/**
 * Flush all pending soft-close kills immediately.
 * Called on renderer teardown to prevent orphan PTY sessions.
 */
const flushPendingKills = (): void => {
	for (const [paneId, timer] of pendingKills) {
		clearTimeout(timer);
		electronTrpcClient.terminal.kill.mutate({ paneId }).catch(() => {});
	}
	pendingKills.clear();
};

// Flush pending kills when the renderer is unloading (crash, reload, quit)
// so that orphan PTY sessions are not left behind.
if (typeof window !== "undefined") {
	window.addEventListener("beforeunload", flushPendingKills);
}
