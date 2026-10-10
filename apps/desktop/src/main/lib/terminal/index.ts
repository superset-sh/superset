import {
	getTerminalHostClient,
	type TerminalHostClient,
} from "main/lib/terminal-host/client";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";
import { DaemonTerminalManager, getDaemonTerminalManager } from "./daemon";
import { stopV1Sessions } from "./stop-v1-sessions";

export { DaemonTerminalManager, getDaemonTerminalManager };
export type {
	CreateSessionParams,
	SessionResult,
	TerminalDataEvent,
	TerminalEvent,
	TerminalExitEvent,
} from "./types";

export interface TerminalDaemonDeps {
	getTerminalHostClient: () => Pick<
		TerminalHostClient,
		"listSessionsIfRunning" | "shutdownIfRunning"
	>;
	getDaemonTerminalManager: () => Pick<DaemonTerminalManager, "reset">;
}

const defaultDeps: TerminalDaemonDeps = {
	getTerminalHostClient,
	getDaemonTerminalManager,
};

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";

/**
 * No UI shows v1 terminals, so a session whose workspace is now in v2 would
 * run unseen next to its v2 resume. Sessions of unmigrated workspaces keep
 * running. Never spawns a daemon.
 */
export async function stopMigratedV1SessionsOnBoot(
	migratedV1WorkspaceIds: Set<string>,
): Promise<void> {
	try {
		const { stoppedPaneIds } = await stopV1Sessions(
			getTerminalHostClient(),
			(session) => migratedV1WorkspaceIds.has(session.workspaceId),
		);
		if (stoppedPaneIds.length > 0) {
			console.log(
				`[TerminalManager] Stopped ${stoppedPaneIds.length} migrated v1 session(s) on boot`,
			);
		}
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to stop migrated v1 sessions:",
			error,
		);
	}
}

/**
 * Restart the terminal daemon. Kills all sessions, shuts down the daemon,
 * and resets the manager so a fresh daemon spawns on next use.
 */
export async function restartDaemon(
	deps: TerminalDaemonDeps = defaultDeps,
): Promise<{ success: boolean }> {
	console.log("[restartDaemon] Starting daemon restart...");

	const client = deps.getTerminalHostClient();

	try {
		const existingSessions = await client.listSessionsIfRunning();

		if (existingSessions) {
			const { sessions } = existingSessions;
			const aliveCount = sessions.filter((s) => s.isAlive).length;
			console.log(
				`[restartDaemon] Shutting down daemon with ${aliveCount} alive sessions`,
			);

			await client.shutdownIfRunning({ killSessions: true });
		} else {
			console.log("[restartDaemon] Daemon was not running");
		}
	} catch (error) {
		console.warn("[restartDaemon] Failed to restart daemon:", error);
		throw error;
	}

	const manager = deps.getDaemonTerminalManager();
	manager.reset();

	console.log("[restartDaemon] Complete");

	return { success: true };
}

export async function tryListExistingDaemonSessions(
	deps: Pick<TerminalDaemonDeps, "getTerminalHostClient"> = defaultDeps,
): Promise<{
	sessions: ListSessionsResponse["sessions"];
}> {
	try {
		const client = deps.getTerminalHostClient();
		const result = await client.listSessionsIfRunning();
		if (!result) {
			return { sessions: [] };
		}
		return { sessions: result.sessions };
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to list existing daemon sessions (getTerminalHostClient/client.listSessionsIfRunning):",
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
