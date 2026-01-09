import { settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import {
	disposeTerminalHostClient,
	getTerminalHostClient,
} from "main/lib/terminal-host/client";
import { DEFAULT_TERMINAL_PERSISTENCE } from "shared/constants";
import {
	DaemonTerminalManager,
	getDaemonTerminalManager,
} from "./daemon-manager";
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

// Cache the daemon mode setting to avoid repeated DB reads
// This is set once at app startup and doesn't change until restart
let cachedDaemonMode: boolean | null = null;
const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";

/**
 * Check if daemon mode is enabled.
 * Reads from user settings (terminalPersistence) or falls back to env var.
 * The value is cached since it requires app restart to take effect.
 */
export function isDaemonModeEnabled(): boolean {
	// Return cached value if available
	if (cachedDaemonMode !== null) {
		return cachedDaemonMode;
	}

	// First check environment variable override (for development/testing)
	if (process.env.SUPERSET_TERMINAL_DAEMON === "1") {
		console.log(
			"[TerminalManager] Daemon mode: ENABLED (via SUPERSET_TERMINAL_DAEMON env var)",
		);
		cachedDaemonMode = true;
		return true;
	}

	// Read from user settings
	try {
		const row = localDb.select().from(settings).get();
		const enabled = row?.terminalPersistence ?? DEFAULT_TERMINAL_PERSISTENCE;
		console.log(
			`[TerminalManager] Daemon mode: ${enabled ? "ENABLED" : "DISABLED"} (via settings.terminalPersistence)`,
		);
		cachedDaemonMode = enabled;
		return enabled;
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to read settings, defaulting to disabled:",
			error,
		);
		cachedDaemonMode = DEFAULT_TERMINAL_PERSISTENCE;
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
 * Should be called on app startup when daemon mode is disabled to clean up
 * any daemon left running from a previous session with persistence enabled.
 *
 * Uses shutdownIfRunning() to avoid spawning a new daemon just to shut it down.
 */
export async function shutdownOrphanedDaemon(): Promise<void> {
	if (isDaemonModeEnabled()) {
		// Daemon mode is enabled, don't shutdown
		return;
	}

	try {
		const client = getTerminalHostClient();
		// Use shutdownIfRunning to avoid spawning a daemon if none exists
		const { wasRunning } = await client.shutdownIfRunning({
			killSessions: true,
		});
		if (wasRunning) {
			console.log("[TerminalManager] Shutdown orphaned daemon successfully");
		} else {
			console.log("[TerminalManager] No orphaned daemon to shutdown");
		}
	} catch (error) {
		// Unexpected error during shutdown attempt
		console.warn(
			"[TerminalManager] Error during orphan daemon cleanup:",
			error,
		);
	} finally {
		// Always dispose the client to clean up any partial state
		disposeTerminalHostClient();
	}
}
