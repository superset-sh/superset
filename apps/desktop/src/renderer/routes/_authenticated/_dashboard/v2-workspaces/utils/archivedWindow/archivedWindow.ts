import type { V2WorkspacesArchivedWindow } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

const DAY_MS = 24 * 60 * 60 * 1000;
const ARCHIVED_WINDOW_MS: Record<
	Exclude<V2WorkspacesArchivedWindow, "none" | "all">,
	number
> = {
	week: 7 * DAY_MS,
	month: 30 * DAY_MS,
};

/** Whether an archived tombstone falls inside the user's chosen window.
 * Shared by the board and list so both views show the same history. */
export function isWithinArchivedWindow(
	archivedAt: number,
	window: V2WorkspacesArchivedWindow,
	now: number,
): boolean {
	if (window === "none") return false;
	if (window === "all") return true;
	return archivedAt >= now - ARCHIVED_WINDOW_MS[window];
}
