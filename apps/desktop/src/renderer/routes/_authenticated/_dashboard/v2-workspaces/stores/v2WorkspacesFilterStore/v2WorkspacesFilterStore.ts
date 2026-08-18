import { create } from "zustand";

export const DEVICE_FILTER_THIS_DEVICE = "this-device";
export const DEVICE_FILTER_ALL_DEVICES = "all-devices";
/** Sentinel for project-less "session" workspaces in the project filter. */
export const PROJECT_FILTER_SESSIONS = "__sessions__";

export type V2WorkspacesDeviceFilter = string;
export type V2WorkspacesProjectFilter = string;

// Self-contained unions (not imported from useAccessibleV2Workspaces) — the
// hook imports this store's constants, so the reverse import would cycle.
export const V2_WORKSPACES_PR_STATE_FILTERS = [
	"open",
	"draft",
	"queued",
	"merged",
	"closed",
] as const;
export type V2WorkspacesPrStateFilter =
	(typeof V2_WORKSPACES_PR_STATE_FILTERS)[number];

export const V2_WORKSPACES_AGENT_STATUS_FILTERS = [
	"idle",
	"working",
	"permission",
	"review",
	"failed",
] as const;
export type V2WorkspacesAgentStatusFilter =
	(typeof V2_WORKSPACES_AGENT_STATUS_FILTERS)[number];

/** Shared by the Agent filter dropdown and the list rows' Agent cell. */
export const V2_WORKSPACES_AGENT_STATUS_LABELS: Record<
	V2WorkspacesAgentStatusFilter,
	string
> = {
	idle: "Idle",
	working: "Working",
	permission: "Needs permission",
	review: "Ready for review",
	failed: "Failed",
};

export type V2WorkspacesViewMode = "list" | "board";

export const V2_WORKSPACES_SORT_MODES = [
	"activity",
	"created",
	"churn",
	"name",
] as const;
export type V2WorkspacesSortMode = (typeof V2_WORKSPACES_SORT_MODES)[number];

export const V2_WORKSPACES_SORT_LABELS: Record<V2WorkspacesSortMode, string> = {
	activity: "Last activity",
	created: "Created",
	churn: "Diff size",
	name: "Name",
};

export const V2_WORKSPACES_ARCHIVED_WINDOWS = [
	"none",
	"week",
	"month",
	"all",
] as const;
export type V2WorkspacesArchivedWindow =
	(typeof V2_WORKSPACES_ARCHIVED_WINDOWS)[number];

interface V2WorkspacesFilterState {
	searchQuery: string;
	deviceFilter: V2WorkspacesDeviceFilter;
	/** Empty = all projects. May contain PROJECT_FILTER_SESSIONS. */
	projectFilters: string[];
	/** Empty = any PR state (including no PR). */
	prStateFilters: V2WorkspacesPrStateFilter[];
	/** Empty = any agent status. */
	agentStatusFilters: V2WorkspacesAgentStatusFilter[];
	viewMode: V2WorkspacesViewMode;
	/** Row order inside status groups (both views). */
	sortMode: V2WorkspacesSortMode;
	/** How far back archived tombstones render (both views). */
	archivedWindow: V2WorkspacesArchivedWindow;
	setSearchQuery: (searchQuery: string) => void;
	setDeviceFilter: (deviceFilter: V2WorkspacesDeviceFilter) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setPrStateFilters: (prStateFilters: V2WorkspacesPrStateFilter[]) => void;
	setAgentStatusFilters: (
		agentStatusFilters: V2WorkspacesAgentStatusFilter[],
	) => void;
	setViewMode: (viewMode: V2WorkspacesViewMode) => void;
	setSortMode: (sortMode: V2WorkspacesSortMode) => void;
	setArchivedWindow: (archivedWindow: V2WorkspacesArchivedWindow) => void;
	/** Clears filters (incl. archived window) — view mode and sort persist. */
	reset: () => void;
}

export const useV2WorkspacesFilterStore = create<V2WorkspacesFilterState>()(
	(set) => ({
		searchQuery: "",
		deviceFilter: DEVICE_FILTER_THIS_DEVICE,
		projectFilters: [],
		prStateFilters: [],
		agentStatusFilters: [],
		viewMode: "list",
		sortMode: "activity",
		archivedWindow: "week",
		setSearchQuery: (searchQuery) => set({ searchQuery }),
		setDeviceFilter: (deviceFilter) => set({ deviceFilter }),
		setProjectFilters: (projectFilters) => set({ projectFilters }),
		setPrStateFilters: (prStateFilters) => set({ prStateFilters }),
		setAgentStatusFilters: (agentStatusFilters) => set({ agentStatusFilters }),
		setViewMode: (viewMode) => set({ viewMode }),
		setSortMode: (sortMode) => set({ sortMode }),
		setArchivedWindow: (archivedWindow) => set({ archivedWindow }),
		reset: () =>
			set({
				searchQuery: "",
				deviceFilter: DEVICE_FILTER_THIS_DEVICE,
				projectFilters: [],
				prStateFilters: [],
				agentStatusFilters: [],
				archivedWindow: "week",
			}),
	}),
);
