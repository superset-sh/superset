import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	LEGACY_WINDOW_KEY,
	MAX_ROUTER_HISTORY_ENTRIES,
} from "shared/window-identity";

export interface PersistedHistory {
	entries: string[];
	index: number;
}

const DEFAULT_HISTORY: PersistedHistory = { entries: ["/"], index: 0 };

/** localStorage keys this store used before it moved to app-state.json. */
const LEGACY_KEY = "router-history";
const LEGACY_SCOPED_PREFIX = "router-history:";

function isValid(value: unknown): value is PersistedHistory {
	if (typeof value !== "object" || value === null) return false;
	const { entries, index } = value as Partial<PersistedHistory>;
	return (
		Array.isArray(entries) &&
		entries.length > 0 &&
		entries.every((entry) => typeof entry === "string" && entry.length > 0) &&
		// Integer, not just a number: `entries[0.5]` is undefined, which would
		// start the router on no route at all. Reachable from a hand-edited
		// profile via the migration path.
		Number.isInteger(index)
	);
}

/** Clamps a stored index into range; a truncated payload can leave it past the end. */
function normalize(history: PersistedHistory): PersistedHistory {
	return {
		entries: history.entries,
		index: Math.min(Math.max(history.index, 0), history.entries.length - 1),
	};
}

export function parseHandoff(
	encoded: string | undefined,
): PersistedHistory | null {
	if (!encoded) return null;
	try {
		const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
		return isValid(parsed) ? normalize(parsed) : null;
	} catch {
		return null;
	}
}

/**
 * Reads the record this window's history used to live in, and removes it.
 *
 * Two shapes existed: a single bare key shared by the whole profile, and a
 * per-window key. Only the window that inherits pre-multi-window state may
 * claim the bare one — every other window would otherwise adopt a route from
 * somebody else's window, in possibly another organization.
 *
 * Runs at module evaluation, which is before `sweepDeadPersistedKeys()` in
 * `renderer/index.tsx` retires these keys: imports are evaluated before the
 * statements that follow them, so the read always wins the race with the sweep.
 */
export function readLegacyHistory(
	windowKey: string | undefined,
	storage: Pick<Storage, "getItem" | "removeItem">,
): PersistedHistory | null {
	const keys = windowKey
		? [`${LEGACY_SCOPED_PREFIX}${windowKey}`]
		: [LEGACY_KEY];
	if (windowKey === LEGACY_WINDOW_KEY) keys.push(LEGACY_KEY);

	for (const key of keys) {
		let raw: string | null = null;
		try {
			raw = storage.getItem(key);
		} catch {
			return null;
		}
		if (raw === null) continue;
		try {
			storage.removeItem(key);
		} catch {}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (isValid(parsed)) return normalize(parsed);
		} catch {}
	}
	return null;
}

/** Applies the entry cap, keeping the newest entries and the current position. */
export function capEntries(entries: string[], index: number): PersistedHistory {
	if (entries.length <= MAX_ROUTER_HISTORY_ENTRIES) return { entries, index };
	const dropped = entries.length - MAX_ROUTER_HISTORY_ENTRIES;
	return {
		entries: entries.slice(dropped),
		index: Math.max(0, index - dropped),
	};
}

export function loadInitialHistory(): PersistedHistory {
	const handoff = parseHandoff(window.App?.routerHistory);
	if (handoff) return handoff;

	let migrated: PersistedHistory | null = null;
	try {
		migrated = readLegacyHistory(window.App?.windowKey, localStorage);
	} catch {}
	if (migrated) {
		// Fire-and-forget: the window already has the history in memory, and a
		// failed write only costs this one migration — the next navigation
		// persists the same entries anyway.
		void persistHistory(migrated.entries, migrated.index);
		return migrated;
	}

	return DEFAULT_HISTORY;
}

export function persistHistory(
	entries: string[],
	index: number,
): Promise<void> {
	const capped = capEntries(entries, index);
	return electronTrpcClient.uiState.routerHistory.set
		.mutate(capped)
		.then(() => undefined)
		.catch((error: unknown) => {
			console.error("[router-history] Failed to persist history:", error);
		});
}
