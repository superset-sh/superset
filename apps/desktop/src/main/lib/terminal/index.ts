import { settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import {
	disposeTerminalHostClient,
	getTerminalHostClient,
} from "main/lib/terminal-host/client";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";
import { DEFAULT_TERMINAL_PERSISTENCE } from "shared/constants";
import { DaemonTerminalManager, getDaemonTerminalManager } from "./daemon";
import { TerminalManager, terminalManager } from "./manager";

export { TerminalManager, terminalManager };
export { DaemonTerminalManager, getDaemonTerminalManager };
export type {
	CreateSessionParams,
	SessionResult,
	TerminalDataEvent,
	TerminalEvent,
	TerminalExitEvent,
} from "./types";

// =============================================================================
// Terminal Manager Selection
// =============================================================================

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";

/**
 * Check if daemon mode is enabled.
 * Reads from user settings (terminalPersistence) or falls back to env var.
 */
export function isDaemonModeEnabled(): boolean {
	// First check environment variable override (for development/testing)
	if (process.env.SUPERSET_TERMINAL_DAEMON === "1") {
		if (DEBUG_TERMINAL) {
			console.log(
				"[TerminalManager] Daemon mode: ENABLED (via SUPERSET_TERMINAL_DAEMON env var)",
			);
		}
		return true;
	}

	// Read from user settings
	try {
		const row = localDb.select().from(settings).get();
		const enabled = row?.terminalPersistence ?? DEFAULT_TERMINAL_PERSISTENCE;
		if (DEBUG_TERMINAL) {
			console.log(
				`[TerminalManager] Daemon mode: ${enabled ? "ENABLED" : "DISABLED"} (via settings.terminalPersistence)`,
			);
		}
		return enabled;
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to read settings, defaulting to disabled:",
			error,
		);
		return DEFAULT_TERMINAL_PERSISTENCE;
	}
}

/**
 * Get the active terminal manager based on current settings.
 * Returns either the in-process manager or the daemon-based manager.
 */
export function getActiveTerminalManager():
	| TerminalManager
	| DaemonTerminalManager {
	const daemonEnabled = isDaemonModeEnabled();
	if (DEBUG_TERMINAL) {
		console.log(
			"[getActiveTerminalManager] Daemon mode enabled:",
			daemonEnabled,
		);
	}
	if (daemonEnabled) {
		return getDaemonTerminalManager();
	}
	return terminalManager;
}

/**
 * Reconcile daemon sessions on app startup.
 * Should be called on app startup when daemon mode is ENABLED to clean up
 * stale sessions from previous app runs.
 *
 * Current semantics: terminal persistence survives app restarts.
 * Reconciliation removes sessions that no longer map to existing workspaces and
 * restores state for sessions that can be retained.
 */
export async function reconcileDaemonSessions(): Promise<void> {
	if (!isDaemonModeEnabled()) {
		// Not in daemon mode, nothing to reconcile
		return;
	}

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
 * Shutdown any orphaned daemon process.
 * Called on app startup when daemon mode is disabled to clean up
 * any daemon left running from a previous session with persistence enabled.
 */
export async function shutdownOrphanedDaemon(): Promise<void> {
	if (isDaemonModeEnabled()) {
		return;
	}

	try {
		const client = getTerminalHostClient();
		const { wasRunning } = await client.shutdownIfRunning({
			killSessions: true,
		});
		if (wasRunning) {
			console.log("[TerminalManager] Shutdown orphaned daemon successfully");
		} else {
			console.log("[TerminalManager] No orphaned daemon to shutdown");
		}
	} catch (error) {
		console.warn(
			"[TerminalManager] Error during orphan daemon cleanup:",
			error,
		);
	} finally {
		disposeTerminalHostClient();
	}
}

export async function tryListExistingDaemonSessions(): Promise<{
	daemonRunning: boolean;
	sessions: ListSessionsResponse["sessions"];
}> {
	try {
		const client = getTerminalHostClient();
		const connected = await client.tryConnectAndAuthenticate();
		if (!connected) {
			return { daemonRunning: false, sessions: [] };
		}

		const result = await client.listSessions();
		return { daemonRunning: true, sessions: result.sessions };
	} catch (error) {
		if (DEBUG_TERMINAL) {
			console.log(
				"[TerminalManager] Failed to list existing daemon sessions:",
				error,
			);
		}
		return { daemonRunning: false, sessions: [] };
	}
}
