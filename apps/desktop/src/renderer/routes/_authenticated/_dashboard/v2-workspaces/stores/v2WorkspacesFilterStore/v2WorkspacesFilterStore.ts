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

export type V2WorkspacesViewMode = "list" | "board";

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
	/** Board-only: how far back archived tombstones render. */
	archivedWindow: V2WorkspacesArchivedWindow;
	setSearchQuery: (searchQuery: string) => void;
	setDeviceFilter: (deviceFilter: V2WorkspacesDeviceFilter) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setPrStateFilters: (prStateFilters: V2WorkspacesPrStateFilter[]) => void;
	setAgentStatusFilters: (
		agentStatusFilters: V2WorkspacesAgentStatusFilter[],
	) => void;
	setViewMode: (viewMode: V2WorkspacesViewMode) => void;
	setArchivedWindow: (archivedWindow: V2WorkspacesArchivedWindow) => void;
	/** Clears filters only — view mode and archived window persist. */
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
		archivedWindow: "week",
		setSearchQuery: (searchQuery) => set({ searchQuery }),
		setDeviceFilter: (deviceFilter) => set({ deviceFilter }),
		setProjectFilters: (projectFilters) => set({ projectFilters }),
		setPrStateFilters: (prStateFilters) => set({ prStateFilters }),
		setAgentStatusFilters: (agentStatusFilters) => set({ agentStatusFilters }),
		setViewMode: (viewMode) => set({ viewMode }),
		setArchivedWindow: (archivedWindow) => set({ archivedWindow }),
		reset: () =>
			set({
				searchQuery: "",
				deviceFilter: DEVICE_FILTER_THIS_DEVICE,
				projectFilters: [],
				prStateFilters: [],
				agentStatusFilters: [],
			}),
	}),
);
