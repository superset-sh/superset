/**
 * Debug logging utility for development and QA.
 *
 * Enable debug logs by setting environment variable:
 *   SUPERSET_DEBUG=1 bun run desktop
 *
 * Or in .env:
 *   SUPERSET_DEBUG=1
 *
 * Usage:
 *   import { debugLog } from "shared/debug";
 *   debugLog("notifications", "Received hook:", data);
 *   // Logs: [debug:notifications] Received hook: {...}
 */

const isDebugEnabled =
	typeof process !== "undefined" &&
	(process.env.SUPERSET_DEBUG === "1" || process.env.SUPERSET_DEBUG === "true");

/**
 * Log a debug message if SUPERSET_DEBUG is enabled.
 *
 * @param namespace - Category for the log (e.g., "notifications", "agent-hooks")
 * @param args - Values to log (same as console.log)
 */
export function debugLog(namespace: string, ...args: unknown[]): void {
	if (isDebugEnabled) {
		console.log(`[debug:${namespace}]`, ...args);
	}
}

/**
 * Check if debug mode is enabled.
 */
export function isDebug(): boolean {
	return isDebugEnabled;
}
