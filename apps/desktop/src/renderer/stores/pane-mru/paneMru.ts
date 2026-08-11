import { entryKey, type PaneMruEntry } from "./types";

/** Runaway guard on the persisted payload; never reached in practice. */
export const MAX_MRU_ENTRIES = 100;

/**
 * Move `entry` to the front, replacing any existing entry for the same pane.
 * Returns the original array when nothing the overlay draws would change.
 */
export function recordFocus({
	entries,
	entry,
}: {
	entries: PaneMruEntry[];
	entry: PaneMruEntry;
}): PaneMruEntry[] {
	const key = entryKey(entry);
	const head = entries[0];
	if (head && entryKey(head) === key && isSameDisplay({ a: head, b: entry })) {
		return entries;
	}

	const rest = entries.filter((existing) => entryKey(existing) !== key);
	return [entry, ...rest].slice(0, MAX_MRU_ENTRIES);
}

/**
 * Drop entries whose pane no longer exists. A workspace absent from the map is
 * treated as "not loaded yet", not "has no panes" — without that, pruning
 * against a half-hydrated collection would delete good entries.
 */
export function pruneToOpenPanes({
	entries,
	openPaneIdsByWorkspace,
}: {
	entries: PaneMruEntry[];
	openPaneIdsByWorkspace: Map<string, Set<string>>;
}): PaneMruEntry[] {
	const next = entries.filter((entry) => {
		const openPaneIds = openPaneIdsByWorkspace.get(entry.workspaceId);
		if (!openPaneIds) return true;
		return openPaneIds.has(entry.paneId);
	});
	return next.length === entries.length ? entries : next;
}

/** True when re-recording would not change anything the overlay draws. */
function isSameDisplay({
	a,
	b,
}: {
	a: PaneMruEntry;
	b: PaneMruEntry;
}): boolean {
	return (
		a.tabId === b.tabId &&
		a.kind === b.kind &&
		a.label === b.label &&
		a.tabLabel === b.tabLabel &&
		a.projectName === b.projectName &&
		a.agentId === b.agentId &&
		a.workspaceName === b.workspaceName
	);
}
