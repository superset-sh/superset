import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
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
	MessageDescriptor
> = {
	idle: msg({ message: "Idle" }),
	working: msg({
		message: "Working",
	}),
	permission: msg({
		message: "Needs permission",
	}),
	review: msg({
		message: "Ready for review",
	}),
	failed: msg({
		message: "Failed",
	}),
};

export const V2_WORKSPACES_PIN_FILTERS = ["all", "pinned", "unpinned"] as const;
export type V2WorkspacesPinFilter = (typeof V2_WORKSPACES_PIN_FILTERS)[number];

export const V2_WORKSPACES_PIN_FILTER_LABELS: Record<
	V2WorkspacesPinFilter,
	MessageDescriptor
> = {
	all: msg({
		message: "All workspaces",
	}),
	pinned: msg({
		message: "Shown",
	}),
	unpinned: msg({
		message: "Hidden",
	}),
};

export type V2WorkspacesViewMode = "list" | "board";

export const V2_WORKSPACES_SORT_MODES = [
	"activity",
	"created",
	"churn",
	"name",
] as const;
export type V2WorkspacesSortMode = (typeof V2_WORKSPACES_SORT_MODES)[number];

export const V2_WORKSPACES_SORT_LABELS: Record<
	V2WorkspacesSortMode,
	MessageDescriptor
> = {
	activity: msg({
		message: "Last activity",
	}),
	created: msg({
		message: "Created",
	}),
	churn: msg({
		message: "Diff size",
	}),
	name: msg({ message: "Name" }),
};

export const V2_WORKSPACES_ARCHIVED_WINDOWS = [
	"none",
	"week",
	"month",
	"all",
] as const;
export type V2WorkspacesArchivedWindow =
	(typeof V2_WORKSPACES_ARCHIVED_WINDOWS)[number];

// Mirrors BoardColumnKey; self-contained to avoid the store → deriveBoardColumn
// → useAccessibleV2Workspaces → store import cycle.
export const V2_WORKSPACES_BOARD_LANES = [
	"idle",
	"working",
	"attention",
	"review",
	"merged",
	"deleted",
] as const;
export type V2WorkspacesBoardLane = (typeof V2_WORKSPACES_BOARD_LANES)[number];

interface V2WorkspacesFilterState {
	searchQuery: string;
	deviceFilter: V2WorkspacesDeviceFilter;
	/** Empty = all projects. May contain PROJECT_FILTER_SESSIONS. */
	projectFilters: string[];
	/** Empty = any PR state (including no PR). */
	prStateFilters: V2WorkspacesPrStateFilter[];
	/** Empty = any agent status. */
	agentStatusFilters: V2WorkspacesAgentStatusFilter[];
	/** Sidebar visibility: shown, hidden, or both ("all"). */
	pinFilter: V2WorkspacesPinFilter;
	viewMode: V2WorkspacesViewMode;
	/** Row order inside status groups (both views). */
	sortMode: V2WorkspacesSortMode;
	/** How far back archived tombstones render (both views). */
	archivedWindow: V2WorkspacesArchivedWindow;
	/** Board lanes the user unchecked in Display; empty = all lanes. */
	hiddenLanes: V2WorkspacesBoardLane[];
	setSearchQuery: (searchQuery: string) => void;
	setDeviceFilter: (deviceFilter: V2WorkspacesDeviceFilter) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setPrStateFilters: (prStateFilters: V2WorkspacesPrStateFilter[]) => void;
	setAgentStatusFilters: (
		agentStatusFilters: V2WorkspacesAgentStatusFilter[],
	) => void;
	setPinFilter: (pinFilter: V2WorkspacesPinFilter) => void;
	setViewMode: (viewMode: V2WorkspacesViewMode) => void;
	setSortMode: (sortMode: V2WorkspacesSortMode) => void;
	setArchivedWindow: (archivedWindow: V2WorkspacesArchivedWindow) => void;
	toggleLane: (lane: V2WorkspacesBoardLane) => void;
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
		pinFilter: "all",
		viewMode: "board",
		sortMode: "activity",
		archivedWindow: "none",
		hiddenLanes: [],
		setSearchQuery: (searchQuery) => set({ searchQuery }),
		setDeviceFilter: (deviceFilter) => set({ deviceFilter }),
		setProjectFilters: (projectFilters) => set({ projectFilters }),
		setPrStateFilters: (prStateFilters) => set({ prStateFilters }),
		setAgentStatusFilters: (agentStatusFilters) => set({ agentStatusFilters }),
		setPinFilter: (pinFilter) => set({ pinFilter }),
		setViewMode: (viewMode) => set({ viewMode }),
		setSortMode: (sortMode) => set({ sortMode }),
		setArchivedWindow: (archivedWindow) => set({ archivedWindow }),
		toggleLane: (lane) =>
			set((state) => ({
				hiddenLanes: state.hiddenLanes.includes(lane)
					? state.hiddenLanes.filter((hidden) => hidden !== lane)
					: [...state.hiddenLanes, lane],
			})),
		reset: () =>
			set({
				searchQuery: "",
				deviceFilter: DEVICE_FILTER_THIS_DEVICE,
				projectFilters: [],
				prStateFilters: [],
				agentStatusFilters: [],
				pinFilter: "all",
				archivedWindow: "none",
				hiddenLanes: [],
			}),
	}),
);
