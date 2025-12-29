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

/**
 * Check if daemon mode is enabled.
 * For now, this is controlled by an environment variable.
 * Later, this will be read from user settings.
 */
export function isDaemonModeEnabled(): boolean {
	// Enable daemon mode via environment variable for testing
	// In production, this will be read from user settings
	//
	// Note: SUPERSET_TERMINAL_DAEMON is baked in at build time via electron.vite.config.ts
	// Set it before running `bun dev` or `bun build`:
	//   SUPERSET_TERMINAL_DAEMON=1 bun dev
	const enabled = process.env.SUPERSET_TERMINAL_DAEMON === "1";
	console.log(
		`[TerminalManager] Daemon mode: ${enabled ? "ENABLED" : "DISABLED"} (SUPERSET_TERMINAL_DAEMON="${process.env.SUPERSET_TERMINAL_DAEMON}")`,
	);
	return enabled;
}

/**
 * Get the active terminal manager based on current settings.
 * Returns either the in-process manager or the daemon-based manager.
 */
export function getActiveTerminalManager():
	| TerminalManager
	| DaemonTerminalManager {
	if (isDaemonModeEnabled()) {
		return getDaemonTerminalManager();
	}
	return terminalManager;
}
