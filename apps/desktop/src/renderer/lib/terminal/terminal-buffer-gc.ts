export const TERMINAL_BUFFER_KEY_PREFIX = "terminal-buffer:";
export const TERMINAL_DIMS_KEY_PREFIX = "terminal-dims:";
/** Stream position paired with the buffer snapshot — see terminal-seq-anchor.ts. */
export const TERMINAL_SEQ_KEY_PREFIX = "terminal-seq:";
/** Single JSON map of terminalId -> epoch ms of the last persist/restore. */
export const TERMINAL_PERSISTED_AT_KEY = "terminal-buffer-persisted-at";

/**
 * Persisted buffers are only deleted on an explicit terminal kill; terminals
 * that disappear any other way (workspace deleted, host reset, crash) would
 * leak their snapshot forever — measured at 945 entries / 23.7 MB after two
 * months, enough to wedge the renderer on the synchronous localStorage load.
 * Boot-time GC drops entries not touched within the TTL and enforces a total
 * size budget so the store stays bounded regardless of how terminals die.
 */
const MAX_PERSISTED_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_TOTAL_BUFFER_CHARS = 2_000_000;
/** Aggressive TTL for when a quota-exhausted write needs space right now. */
const QUOTA_PRESSURE_AGE_MS = 24 * 60 * 60 * 1000;

type PersistedAtIndex = Record<string, number>;

function readIndex(storage: Storage): PersistedAtIndex {
	try {
		const raw = storage.getItem(TERMINAL_PERSISTED_AT_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return {};
		const index: PersistedAtIndex = {};
		for (const [id, persistedAt] of Object.entries(parsed)) {
			if (typeof persistedAt === "number") index[id] = persistedAt;
		}
		return index;
	} catch {
		return {};
	}
}

function writeIndex(storage: Storage, index: PersistedAtIndex): void {
	try {
		storage.setItem(TERMINAL_PERSISTED_AT_KEY, JSON.stringify(index));
	} catch {}
}

export function touchTerminalStatePersistedAt(
	terminalId: string,
	storage: Storage = localStorage,
	now: number = Date.now(),
): void {
	const index = readIndex(storage);
	index[terminalId] = now;
	writeIndex(storage, index);
}

export function removeTerminalStatePersistedAt(
	terminalId: string,
	storage: Storage = localStorage,
): void {
	const index = readIndex(storage);
	if (!(terminalId in index)) return;
	delete index[terminalId];
	writeIndex(storage, index);
}

/** Removes a terminal's buffer + dims + seq keys, reporting how many existed. */
function removeTerminalState(storage: Storage, terminalId: string): number {
	let removed = 0;
	try {
		for (const key of [
			`${TERMINAL_BUFFER_KEY_PREFIX}${terminalId}`,
			`${TERMINAL_DIMS_KEY_PREFIX}${terminalId}`,
			`${TERMINAL_SEQ_KEY_PREFIX}${terminalId}`,
		]) {
			if (storage.getItem(key) !== null) {
				storage.removeItem(key);
				removed++;
			}
		}
	} catch {}
	return removed;
}

function collectTerminalIds(storage: Storage): Set<string> {
	const ids = new Set<string>();
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (!key) continue;
		if (key.startsWith(TERMINAL_BUFFER_KEY_PREFIX)) {
			ids.add(key.slice(TERMINAL_BUFFER_KEY_PREFIX.length));
		} else if (key.startsWith(TERMINAL_DIMS_KEY_PREFIX)) {
			ids.add(key.slice(TERMINAL_DIMS_KEY_PREFIX.length));
		} else if (key.startsWith(TERMINAL_SEQ_KEY_PREFIX)) {
			ids.add(key.slice(TERMINAL_SEQ_KEY_PREFIX.length));
		}
	}
	return ids;
}

/**
 * Quota-pressure reclaim for `withQuotaGuard`: a collection write just failed
 * on a full store, so shrink the snapshot budget to a 24h TTL and free
 * everything older (unstamped included). Returns removed key count; 0 tells
 * the guard a retry is pointless.
 */
export function reclaimTerminalStateForQuota(
	storage: Storage = localStorage,
	now: number = Date.now(),
): number {
	try {
		const index = readIndex(storage);
		let removed = 0;
		for (const id of collectTerminalIds(storage)) {
			const persistedAt = index[id];
			if (
				persistedAt !== undefined &&
				now - persistedAt <= QUOTA_PRESSURE_AGE_MS
			) {
				continue;
			}
			removed += removeTerminalState(storage, id);
			delete index[id];
		}
		if (removed > 0) writeIndex(storage, index);
		return removed;
	} catch {
		return 0;
	}
}

/**
 * Drop every persisted terminal snapshot, fresh ones included. Costs parked
 * terminals their restore, so only call from an explicit user action (the
 * quota toast's "Free up space"). Returns removed key count.
 */
export function clearAllTerminalState(storage: Storage = localStorage): number {
	try {
		let removed = 0;
		for (const id of collectTerminalIds(storage)) {
			removed += removeTerminalState(storage, id);
		}
		if (storage.getItem(TERMINAL_PERSISTED_AT_KEY) !== null) {
			storage.removeItem(TERMINAL_PERSISTED_AT_KEY);
		}
		return removed;
	} catch {
		return 0;
	}
}

/**
 * Run once at renderer boot, before any terminal mounts. Entries with no
 * stamp predate the bounded store and are treated as expired — a one-time
 * scrollback-restore loss on first launch after the upgrade, in exchange for
 * clearing the accumulated bloat immediately instead of after a full TTL.
 */
export function pruneExpiredTerminalState(
	storage: Storage = localStorage,
	now: number = Date.now(),
): void {
	try {
		const index = readIndex(storage);
		const ids = collectTerminalIds(storage);

		const survivors: Array<{ id: string; persistedAt: number }> = [];
		for (const id of ids) {
			const persistedAt = index[id];
			if (
				persistedAt === undefined ||
				now - persistedAt > MAX_PERSISTED_AGE_MS
			) {
				removeTerminalState(storage, id);
				delete index[id];
			} else {
				survivors.push({ id, persistedAt });
			}
		}

		// Newest-first size budget: buffers past the cap go, whatever their age.
		survivors.sort((a, b) => b.persistedAt - a.persistedAt);
		let totalChars = 0;
		for (const { id } of survivors) {
			const buffer = storage.getItem(`${TERMINAL_BUFFER_KEY_PREFIX}${id}`);
			totalChars += buffer?.length ?? 0;
			if (totalChars > MAX_TOTAL_BUFFER_CHARS) {
				removeTerminalState(storage, id);
				delete index[id];
			}
		}

		// Index rows whose buffer and dims are both gone are dead weight.
		for (const id of Object.keys(index)) {
			if (!ids.has(id)) delete index[id];
		}

		writeIndex(storage, index);
	} catch {}
}
