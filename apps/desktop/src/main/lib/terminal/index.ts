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

// Cached daemon mode setting. Updated at startup and via enable/disable functions.
let cachedDaemonMode: boolean | null = null;
const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";

/**
 * Check if daemon mode is enabled. Caches the result after first read.
 */
export function isDaemonModeEnabled(): boolean {
	if (cachedDaemonMode !== null) {
		return cachedDaemonMode;
	}

	// Environment variable override for development/testing
	if (process.env.SUPERSET_TERMINAL_DAEMON === "1") {
		console.log("[TerminalManager] Daemon mode: ENABLED (env override)");
		cachedDaemonMode = true;
		return true;
	}

	// Read from user settings
	try {
		const row = localDb.select().from(settings).get();
		const enabled = row?.terminalPersistence ?? DEFAULT_TERMINAL_PERSISTENCE;
		console.log(
			`[TerminalManager] Daemon mode: ${enabled ? "ENABLED" : "DISABLED"}`,
		);
		cachedDaemonMode = enabled;
		return enabled;
	} catch (error) {
		console.warn("[TerminalManager] Failed to read settings:", error);
		cachedDaemonMode = DEFAULT_TERMINAL_PERSISTENCE;
		return DEFAULT_TERMINAL_PERSISTENCE;
	}
}

/**
 * Get the active terminal manager based on current daemon mode setting.
 */
export function getActiveTerminalManager():
	| TerminalManager
	| DaemonTerminalManager {
	const daemonEnabled = isDaemonModeEnabled();
	if (DEBUG_TERMINAL) {
		console.log("[getActiveTerminalManager] Daemon:", daemonEnabled);
	}
	return daemonEnabled ? getDaemonTerminalManager() : terminalManager;
}

// =============================================================================
// Core Daemon Operations
// =============================================================================

/**
 * Initialize daemon and reconcile sessions.
 * Used by both startup and runtime enable paths.
 */
async function initializeDaemon(): Promise<void> {
	const manager = getDaemonTerminalManager();
	await manager.reconcileOnStartup();
}

/**
 * Shutdown daemon and dispose client.
 * Used by both startup orphan cleanup and runtime disable paths.
 */
async function shutdownDaemon(): Promise<{ wasRunning: boolean }> {
	try {
		const client = getTerminalHostClient();
		const result = await client.shutdownIfRunning({ killSessions: true });
		return result;
	} finally {
		disposeTerminalHostClient();
	}
}

// =============================================================================
// Startup Functions
// =============================================================================

/**
 * Reconcile daemon sessions on app startup (if daemon mode is enabled).
 */
export async function reconcileDaemonSessions(): Promise<void> {
	if (!isDaemonModeEnabled()) {
		return;
	}

	try {
		await initializeDaemon();
	} catch (error) {
		console.warn("[TerminalManager] Failed to reconcile daemon sessions:", error);
	}
}

/**
 * Shutdown orphaned daemon on app startup (if daemon mode is disabled).
 */
export async function shutdownOrphanedDaemon(): Promise<void> {
	if (isDaemonModeEnabled()) {
		return;
	}

	try {
		const { wasRunning } = await shutdownDaemon();
		console.log(
			`[TerminalManager] Orphan cleanup: ${wasRunning ? "daemon shutdown" : "no daemon"}`,
		);
	} catch (error) {
		console.warn("[TerminalManager] Orphan cleanup error:", error);
	}
}

// =============================================================================
// Runtime Toggle Functions
// =============================================================================

/**
 * Enable daemon mode at runtime. Initializes daemon and reconciles sessions.
 */
export async function enableDaemonMode(): Promise<void> {
	if (cachedDaemonMode === true) {
		return;
	}

	console.log("[TerminalManager] Enabling daemon mode");
	cachedDaemonMode = true;

	try {
		await initializeDaemon();
	} catch (error) {
		console.error("[TerminalManager] Failed to enable daemon mode:", error);
		throw error;
	}
}

/**
 * Disable daemon mode at runtime. Shuts down daemon and terminates all sessions.
 */
export async function disableDaemonMode(): Promise<void> {
	if (cachedDaemonMode === false) {
		return;
	}

	console.log("[TerminalManager] Disabling daemon mode");
	cachedDaemonMode = false;

	try {
		const { wasRunning } = await shutdownDaemon();
		console.log(
			`[TerminalManager] Daemon ${wasRunning ? "shutdown" : "was not running"}`,
		);
	} catch (error) {
		console.warn("[TerminalManager] Daemon shutdown error:", error);
	}
}
