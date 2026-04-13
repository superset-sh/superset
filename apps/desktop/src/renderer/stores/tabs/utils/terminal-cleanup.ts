import { electronTrpcClient } from "renderer/lib/trpc-client";

/**
 * Soft-close delay: terminal sessions are kept alive for this duration after
 * a pane/tab is closed, allowing "reopen closed tab" (Cmd+Shift+R) to restore
 * the live session with full scrollback and running processes.
 */
const SOFT_CLOSE_DELAY_MS = 60_000;
const PENDING_KILLS_STORAGE_KEY = "superset:terminal:pending-soft-close-kills";

const pendingKills = new Map<string, ReturnType<typeof setTimeout>>();

const persistPendingKills = (): void => {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			PENDING_KILLS_STORAGE_KEY,
			JSON.stringify([...pendingKills.keys()]),
		);
	} catch (error) {
		console.warn("Failed to persist pending soft-close kills:", error);
	}
};

const readPersistedPendingKills = (): string[] => {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(PENDING_KILLS_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((id): id is string => typeof id === "string")
			: [];
	} catch (error) {
		console.warn("Failed to read persisted pending soft-close kills:", error);
		return [];
	}
};

const clearPersistedPendingKills = (): void => {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(PENDING_KILLS_STORAGE_KEY);
	} catch (error) {
		console.warn("Failed to clear persisted pending soft-close kills:", error);
	}
};

/**
 * Schedule a terminal kill after SOFT_CLOSE_DELAY_MS.
 * Used by removeTab/removePane so the session stays alive for reopening.
 */
export const scheduleKillTerminalForPane = (paneId: string): void => {
	cancelPendingKill(paneId);

	const timer = setTimeout(() => {
		pendingKills.delete(paneId);
		persistPendingKills();
		electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
			console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
		});
	}, SOFT_CLOSE_DELAY_MS);

	pendingKills.set(paneId, timer);
	persistPendingKills();
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
		persistPendingKills();
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
		electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
			console.warn(`Failed to flush pending kill for pane ${paneId}:`, error);
		});
	}
	pendingKills.clear();
	clearPersistedPendingKills();
};

/**
 * Recover pending soft-close kills after renderer crash/reload.
 * If timers were lost, best effort kill the affected pane sessions on next boot.
 */
const replayPersistedPendingKills = (): void => {
	const paneIds = readPersistedPendingKills();
	if (paneIds.length === 0) return;

	for (const paneId of paneIds) {
		electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
			console.warn(`Failed to replay pending kill for pane ${paneId}:`, error);
		});
	}
	clearPersistedPendingKills();
};

// Flush pending kills when the renderer is unloading (crash, reload, quit)
// so that orphan PTY sessions are not left behind.
if (typeof window !== "undefined") {
	replayPersistedPendingKills();
	window.addEventListener("beforeunload", flushPendingKills);
}
