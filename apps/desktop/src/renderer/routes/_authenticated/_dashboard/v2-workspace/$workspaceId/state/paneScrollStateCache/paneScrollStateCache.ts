const STORAGE_KEY = "v2-pane-scroll-state-v1";
const MAX_ENTRIES = 250;
const WRITE_DELAY_MS = 200;

export interface PaneScrollPosition {
	scrollTop: number;
	scrollLeft: number;
}

export interface PaneScrollState extends PaneScrollPosition {
	updatedAt: number;
}

let cache: Map<string, PaneScrollState> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function getStorage(): Storage | null {
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		return null;
	}
}

function getCache(): Map<string, PaneScrollState> {
	if (cache) return cache;
	try {
		const saved = JSON.parse(getStorage()?.getItem(STORAGE_KEY) ?? "[]");
		cache = new Map(Array.isArray(saved) ? saved : []);
	} catch {
		cache = new Map();
	}
	while (cache.size > MAX_ENTRIES) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey === undefined) break;
		cache.delete(oldestKey);
	}
	return cache;
}

function scheduleWrite(): void {
	if (writeTimer !== null || !getStorage()) return;
	writeTimer = setTimeout(flushPaneScrollStateCache, WRITE_DELAY_MS);
}

export function flushPaneScrollStateCache(): void {
	if (writeTimer !== null) clearTimeout(writeTimer);
	writeTimer = null;
	if (!cache) return;
	try {
		getStorage()?.setItem(STORAGE_KEY, JSON.stringify([...cache]));
	} catch {
		// Scroll restoration is best-effort and must not break an editor pane.
	}
}

/** Used by tests and by any future "reset local UI state" action. */
export function clearPaneScrollStateCache(): void {
	if (writeTimer !== null) clearTimeout(writeTimer);
	writeTimer = null;
	cache = new Map();
	try {
		getStorage()?.removeItem(STORAGE_KEY);
	} catch {
		// Keep the in-memory cache usable when localStorage is unavailable.
	}
}

export function createPaneScrollStateKey({
	workspaceId,
	paneId,
	viewId,
	resourceId,
}: {
	workspaceId: string;
	paneId?: string;
	viewId: "diff" | "editor";
	resourceId: string;
}): string {
	return JSON.stringify([workspaceId, paneId ?? null, viewId, resourceId]);
}

export function getPaneScrollState(key: string): PaneScrollState | undefined {
	const state = getCache().get(key);
	if (
		!state ||
		!Number.isFinite(state.scrollTop) ||
		!Number.isFinite(state.scrollLeft) ||
		!Number.isFinite(state.updatedAt)
	) {
		return undefined;
	}
	return { ...state };
}

export function savePaneScrollState(
	key: string,
	position: PaneScrollPosition,
): void {
	if (
		!Number.isFinite(position.scrollTop) ||
		!Number.isFinite(position.scrollLeft)
	) {
		return;
	}
	const entries = getCache();
	entries.delete(key);
	entries.set(key, {
		scrollTop: Math.max(0, position.scrollTop),
		scrollLeft: Math.max(0, position.scrollLeft),
		updatedAt: Date.now(),
	});
	if (entries.size > MAX_ENTRIES) {
		const oldestKey = entries.keys().next().value;
		if (oldestKey !== undefined) entries.delete(oldestKey);
	}
	scheduleWrite();
}

if (typeof window !== "undefined") {
	window.addEventListener("pagehide", flushPaneScrollStateCache);
}
