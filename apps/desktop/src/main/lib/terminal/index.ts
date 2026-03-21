import { getTerminalHostClient } from "main/lib/terminal-host/client";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";
import { DaemonTerminalManager, getDaemonTerminalManager } from "./daemon";
import { prewarmTerminalEnv } from "./env";

export { DaemonTerminalManager, getDaemonTerminalManager };
export type {
	CreateSessionParams,
	SessionResult,
	TerminalDataEvent,
	TerminalEvent,
	TerminalExitEvent,
} from "./types";

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";
let prewarmInFlight: Promise<void> | null = null;

/**
 * Reconcile daemon sessions on app startup.
 * Cleans up stale sessions from previous app runs and preserves sessions
 * that can be retained.
 */
export async function reconcileDaemonSessions(): Promise<void> {
	try {
		const manager = getDaemonTerminalManager();
		await manager.reconcileOnStartup();
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to reconcile daemon sessions:",
			error,
		);
	}
}

/**
 * Restart the terminal daemon. Kills all sessions, shuts down the daemon,
 * and resets the manager so a fresh daemon spawns on next use.
 */
export async function restartDaemon(): Promise<{ success: boolean }> {
	console.log("[restartDaemon] Starting daemon restart...");

	try {
		const client = getTerminalHostClient();
		const connected = await client.tryConnectAndAuthenticate();

		if (connected) {
			const { sessions } = await client.listSessions();
			const aliveCount = sessions.filter((s) => s.isAlive).length;
			console.log(
				`[restartDaemon] Shutting down daemon with ${aliveCount} alive sessions`,
			);

			await client.shutdownIfRunning({ killSessions: true });
		} else {
			console.log("[restartDaemon] Daemon was not running");
		}
	} catch (error) {
		console.warn("[restartDaemon] Error during shutdown (continuing):", error);
	}

	const manager = getDaemonTerminalManager();
	manager.reset();

	console.log("[restartDaemon] Complete");

	return { success: true };
}

export async function tryListExistingDaemonSessions(): Promise<{
	sessions: ListSessionsResponse["sessions"];
}> {
	try {
		const client = getTerminalHostClient();
		const result = await client.listSessions();
		return { sessions: result.sessions };
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to list existing daemon sessions (getTerminalHostClient/client.listSessions):",
			error,
		);
		if (DEBUG_TERMINAL) {
			console.log(
				"[TerminalManager] Failed to list existing daemon sessions:",
				error,
			);
		}
		return { sessions: [] };
	}
}

/**
 * Best-effort terminal runtime warmup.
 * Runs in the background to reduce latency for the first user-opened terminal:
 * - precomputes locale/env fallback
 * - ensures daemon control/stream channels are established
 */
export function prewarmTerminalRuntime(): void {
	if (prewarmInFlight) return;

	prewarmInFlight = (async () => {
		try {
			prewarmTerminalEnv();
		} catch (error) {
			if (DEBUG_TERMINAL) {
				console.warn(
					"[TerminalManager] Failed to prewarm terminal env:",
					error,
				);
			}
		}

		try {
			await getTerminalHostClient().ensureConnected();
		} catch (error) {
			if (DEBUG_TERMINAL) {
				console.warn(
					"[TerminalManager] Failed to prewarm terminal daemon connection:",
					error,
				);
			}
		}
	})().finally(() => {
		prewarmInFlight = null;
	});
}
