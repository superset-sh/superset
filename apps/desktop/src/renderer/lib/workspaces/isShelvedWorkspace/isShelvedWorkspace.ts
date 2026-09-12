/**
 * How long a shelved ("archived" in the UI) workspace is kept before the host
 * purges it. The host owns the authoritative copy of this window; keep the two
 * equal.
 */
export const SHELF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** The same window in whole days, for user-facing copy. */
export const SHELF_RETENTION_DAYS = Math.round(
	SHELF_RETENTION_MS / (24 * 60 * 60 * 1000),
);

/**
 * Whether a host-served workspace row is shelved — the internal name for the
 * UI's "archived". Shelved rows are live workspaces (unlike `archivedAt`
 * tombstones) that the user moved off every active surface, so every
 * non-sidebar consumer excludes them through this one predicate.
 *
 * The field is optional: a row served by a host that predates the column — or
 * restored from an older IndexedDB snapshot — carries it absent, which reads
 * as live.
 *
 * A purged row keeps its shelf stamp under the tombstone, so `archivedAt` wins:
 * a tombstone a caller explicitly asked for is never hidden as shelved.
 */
export function isShelvedWorkspace(workspace: {
	shelvedAt?: number | null;
	archivedAt?: number | null;
}): boolean {
	if (workspace.archivedAt != null) return false;
	return workspace.shelvedAt != null;
}
