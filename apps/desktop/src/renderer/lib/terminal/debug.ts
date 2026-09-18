/**
 * Terminal lifecycle debug logging, enabled from DevTools with
 * `localStorage.setItem("SUPERSET_TERMINAL_DEBUG", "1")`.
 *
 * A function rather than a bare constant so a caller can pick the flag up
 * without a reload; `DEBUG_TERMINAL` snapshots it at module load for the hot
 * paths that check it per frame.
 */
export function isTerminalDebugEnabled(): boolean {
	try {
		return (
			typeof localStorage !== "undefined" &&
			localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1"
		);
	} catch {
		return false;
	}
}
