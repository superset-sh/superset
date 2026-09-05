import {
	V2_WORKSPACES_ARCHIVED_WINDOWS,
	V2_WORKSPACES_PIN_FILTERS,
	V2_WORKSPACES_VIEW_MODES,
	type V2WorkspacesArchivedWindow,
	type V2WorkspacesPinFilter,
	type V2WorkspacesViewMode,
} from "../../stores/v2WorkspacesFilterStore";

export type V2WorkspacesSearch = {
	q?: string;
	device?: string;
	/** Comma-joined project ids; may include the `__sessions__` sentinel. */
	projects?: string;
	/** Comma-joined PR states. */
	pr?: string;
	/** Comma-joined agent statuses. */
	agent?: string;
	/** Comma-joined creator user ids. */
	creators?: string;
	/** Sidebar pin visibility; omitted = "all". */
	pin?: V2WorkspacesPinFilter;
	/** List, board, or the user-archived view; omitted = the persisted choice. */
	view?: V2WorkspacesViewMode;
	/** Tombstone (Merged/Deleted) lookback — the Display menu's "History". */
	archived?: V2WorkspacesArchivedWindow;
};

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

function oneOf<T extends string>(
	value: unknown,
	allowed: readonly T[],
): T | undefined {
	return allowed.includes(value as T) ? (value as T) : undefined;
}

/** The Workspaces page's `validateSearch`: unknown or malformed params drop
 * out rather than throwing, so a stale deep link still lands on the page. */
export function parseV2WorkspacesSearch(
	search: Record<string, unknown>,
): V2WorkspacesSearch {
	return {
		q: nonEmptyString(search.q),
		device: nonEmptyString(search.device),
		projects: nonEmptyString(search.projects),
		pr: nonEmptyString(search.pr),
		agent: nonEmptyString(search.agent),
		creators: nonEmptyString(search.creators),
		pin: oneOf(search.pin, V2_WORKSPACES_PIN_FILTERS),
		view: oneOf(search.view, V2_WORKSPACES_VIEW_MODES),
		archived: oneOf(search.archived, V2_WORKSPACES_ARCHIVED_WINDOWS),
	};
}
