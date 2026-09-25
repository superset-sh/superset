import type { WorkspacesArchivedWindow } from "renderer/routes/_authenticated/_dashboard/workspaces/stores/workspacesFilterStore";

const DAY_MS = 24 * 60 * 60 * 1000;
const ARCHIVED_WINDOW_MS: Record<
	Exclude<WorkspacesArchivedWindow, "none" | "all">,
	number
> = {
	week: 7 * DAY_MS,
	month: 30 * DAY_MS,
};

/** Whether an archived tombstone falls inside the user's chosen window.
 * Shared by the board and list so both views show the same history. */
export function isWithinArchivedWindow(
	archivedAt: number,
	window: WorkspacesArchivedWindow,
	now: number,
): boolean {
	if (window === "none") return false;
	if (window === "all") return true;
	return archivedAt >= now - ARCHIVED_WINDOW_MS[window];
}
