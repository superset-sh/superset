import {
	TERMINAL_BUFFER_KEY_PREFIX,
	TERMINAL_DIMS_KEY_PREFIX,
} from "shared/constants";

/**
 * Pure selection policy for reclaiming persisted terminal snapshots. Depends
 * only on the key prefixes, so it unit-tests without pulling the
 * xterm/transport import graph into the test process, matching
 * `terminal-runtime-eviction.ts`.
 *
 * Parking a hidden terminal writes its scrollback to localStorage and
 * deliberately leaves the snapshot behind, so a terminal that later goes away
 * by any other route strands its keys forever. Those strays are what exhaust
 * the origin's storage budget.
 */

/** Prefixed key paired with the terminal id it was written for. */
interface SnapshotKey {
	key: string;
	terminalId: string;
}

function parseSnapshotKey(key: string): SnapshotKey | null {
	for (const prefix of [TERMINAL_BUFFER_KEY_PREFIX, TERMINAL_DIMS_KEY_PREFIX]) {
		if (key.startsWith(prefix)) {
			return { key, terminalId: key.slice(prefix.length) };
		}
	}
	return null;
}

/**
 * Snapshot keys whose terminal no live entry can reach, and which are therefore
 * safe to drop. `reachableTerminalIds` must include parked terminals — their
 * runtime is released but the snapshot is how they get restored, so dropping
 * one silently loses that terminal's scrollback.
 *
 * A key with an empty terminal id is treated as reachable rather than orphaned:
 * it cannot have been written by `persistBuffer`, so it belongs to something
 * this policy does not understand and must not delete.
 */
export function selectOrphanedTerminalSnapshots(
	keys: Iterable<string>,
	reachableTerminalIds: ReadonlySet<string>,
): string[] {
	const orphaned: string[] = [];
	for (const key of keys) {
		const snapshot = parseSnapshotKey(key);
		if (!snapshot || !snapshot.terminalId) continue;
		if (reachableTerminalIds.has(snapshot.terminalId)) continue;
		orphaned.push(snapshot.key);
	}
	return orphaned;
}
