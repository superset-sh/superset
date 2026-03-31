import type { ColdRestoreState } from "./types";

/**
 * Module-level map to track pending detach timeouts.
 * This survives React StrictMode's unmount/remount cycle, allowing us to
 * cancel a pending detach if the component immediately remounts.
 */
export const pendingDetaches = new Map<string, NodeJS.Timeout>();

/**
 * Module-level map to track cold restore state across StrictMode cycles.
 * When cold restore is detected, we store the state here so it survives
 * the unmount/remount that StrictMode causes. Without this, the first mount
 * detects cold restore and sets state, but StrictMode unmounts and remounts
 * with fresh state, losing the cold restore detection.
 *
 * Capped to prevent unbounded memory growth from scrollback strings.
 */
const MAX_COLD_RESTORE_ENTRIES = 20;
export const coldRestoreState = new Map<string, ColdRestoreState>();

export function setColdRestoreState(
	paneId: string,
	state: ColdRestoreState,
): void {
	coldRestoreState.set(paneId, state);
	// Evict oldest entries to prevent unbounded growth from large scrollback strings
	if (coldRestoreState.size > MAX_COLD_RESTORE_ENTRIES) {
		const iterator = coldRestoreState.keys();
		const oldest = iterator.next().value;
		if (oldest !== undefined && oldest !== paneId) {
			coldRestoreState.delete(oldest);
		}
	}
}
