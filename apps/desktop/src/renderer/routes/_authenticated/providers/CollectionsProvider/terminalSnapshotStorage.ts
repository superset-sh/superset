import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import {
	TERMINAL_BUFFER_KEY_PREFIX,
	TERMINAL_DIMS_KEY_PREFIX,
} from "shared/constants";
import { selectOrphanedTerminalSnapshots } from "./selectOrphanedTerminalSnapshots";

/**
 * Storage-facing half of terminal snapshot reclamation. The decision lives in
 * `selectOrphanedTerminalSnapshots`, so it stays pure and testable, mirroring
 * how `selectRuntimesToEvict` decides and the registry disposes.
 */

/** `Storage`, narrowed to what enumerating and deleting actually needs. */
export interface EnumerableStorage {
	readonly length: number;
	key(index: number): string | null;
	removeItem(key: string): void;
}

function readKeys(storage: EnumerableStorage): string[] {
	const keys: string[] = [];
	for (let index = 0; index < storage.length; index++) {
		const key = storage.key(index);
		if (key !== null) keys.push(key);
	}
	return keys;
}

/**
 * Drop persisted scrollback and dimensions for terminals this renderer can no
 * longer reach, and report how many keys went away. Runs on the quota path
 * rather than at startup: a store that is already full fails its first write
 * within seconds of launch, so reclaiming there also recovers a profile that
 * was left wedged by a previous session.
 */
export function reclaimOrphanedTerminalSnapshots(
	storage: EnumerableStorage = window.localStorage,
	reachableTerminalIds: ReadonlySet<string> = terminalRuntimeRegistry.getRegisteredTerminalIds(),
): number {
	const orphaned = selectOrphanedTerminalSnapshots(
		readKeys(storage),
		reachableTerminalIds,
	);
	for (const key of orphaned) {
		storage.removeItem(key);
	}
	return orphaned.length;
}

/**
 * Drop every terminal snapshot, reachable ones included, and report how many
 * keys went away. Unlike the reclaim above this is destructive in a way the
 * user can see: a parked terminal restores from its snapshot, so clearing one
 * costs that terminal its scrollback. Only call it from an explicit user
 * action.
 */
export function clearAllTerminalSnapshots(
	storage: EnumerableStorage = window.localStorage,
): number {
	const snapshotKeys = readKeys(storage).filter(
		(key) =>
			key.startsWith(TERMINAL_BUFFER_KEY_PREFIX) ||
			key.startsWith(TERMINAL_DIMS_KEY_PREFIX),
	);
	for (const key of snapshotKeys) {
		storage.removeItem(key);
	}
	return snapshotKeys.length;
}
