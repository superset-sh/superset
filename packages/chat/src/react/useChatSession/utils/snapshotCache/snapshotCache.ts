import type { SessionSnapshot } from "../../../../core";

const MAX_CACHED_SNAPSHOTS = 5;

const snapshots = new Map<string, SessionSnapshot>();

export function cachedSnapshot(sessionId: string): SessionSnapshot | undefined {
	return snapshots.get(sessionId);
}

export function cacheSnapshot(
	sessionId: string,
	snapshot: SessionSnapshot,
): void {
	snapshots.delete(sessionId);
	snapshots.set(sessionId, snapshot);
	for (const oldest of snapshots.keys()) {
		if (snapshots.size <= MAX_CACHED_SNAPSHOTS) break;
		snapshots.delete(oldest);
	}
}

export function forgetSnapshot(sessionId: string): void {
	snapshots.delete(sessionId);
}
