export interface WorkspaceActivityFields {
	lastActivityAt: Date | string | number | null | undefined;
	updatedAt: Date | string | number | null | undefined;
}

// Timestamps are typed as Date but can arrive as ISO strings at runtime
// (IndexedDB snapshots, persisted query caches). Sorting is cosmetic, so
// coerce instead of trusting the type — a bad value must never throw
// mid-render and take a workspace list down with it.
export function toTime(
	value: Date | string | number | null | undefined,
): number {
	if (value == null) return Number.NaN;
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") return value;
	return new Date(value).getTime();
}

/**
 * When a workspace was last active. The host stamps `lastActivityAt` on
 * agent lifecycle events and it alone ranks the row once present; only rows
 * from a host that predates the column fall back to `updatedAt`. Deliberately
 * not `max` of the two: `updatedAt` moves on renames and bulk moves, and
 * "last active" must not jump a workspace to the top from housekeeping.
 */
export function getWorkspaceActivityTime(
	workspace: WorkspaceActivityFields,
): number {
	const activity = workspace.lastActivityAt;
	if (typeof activity === "number" && !Number.isNaN(activity)) return activity;
	return toTime(workspace.updatedAt);
}
