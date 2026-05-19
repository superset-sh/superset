/** Ignores early keystrokes right after mount/reconnect. */
const ACTIVITY_GRACE_PERIOD_MS = 5_000;
/** Minimum interval between successive lastActivityAt updates. */
const ACTIVITY_DEBOUNCE_MS = 30_000;

/**
 * Pure logic for activity tracking — no React, easy to test.
 *
 * Create once per subscription lifetime; call `handleData` on every
 * user-input event. The tracker decides whether enough time has elapsed
 * to propagate the update.
 */
export function trackTerminalActivity(startTime: number) {
	let lastUpdate = 0;

	return {
		handleData(
			updateLastActivityAt: (workspaceId: string) => void,
			workspaceId: string,
			now: number = Date.now(),
		) {
			const sinceStart = now - startTime;
			const sinceLast = now - lastUpdate;
			if (
				sinceStart > ACTIVITY_GRACE_PERIOD_MS &&
				sinceLast > ACTIVITY_DEBOUNCE_MS
			) {
				lastUpdate = now;
				updateLastActivityAt(workspaceId);
			}
		},
	};
}
