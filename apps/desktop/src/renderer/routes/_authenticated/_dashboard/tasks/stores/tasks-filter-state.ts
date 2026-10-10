import {
	areProjectFiltersEqual,
	normalizeProjectFilters,
	serializeProjectFilters,
} from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "table" | "board";
export type TypeTab = "tasks" | "linear" | "issues";
export type FilterTab =
	| "all"
	| "active"
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

const FILTER_TABS = new Set<unknown>([
	"all",
	"active",
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
]);

function isFilterTab(value: unknown): value is FilterTab {
	return FILTER_TABS.has(value);
}

interface TasksFilterState {
	tab: FilterTab;
	assignee: string | null;
	search: string;
	viewMode: ViewMode;
	typeTab: TypeTab;
	projectFilters: string[];
	linearTeamFilter: string | null;
	linearAssigneeFilter: string | null;
	includeClosedIssues: boolean;
	setTab: (tab: FilterTab) => void;
	setAssignee: (assignee: string | null) => void;
	setSearch: (search: string) => void;
	setViewMode: (viewMode: ViewMode) => void;
	setTypeTab: (typeTab: TypeTab) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setLinearTeamFilter: (linearTeamFilter: string | null) => void;
	setLinearAssigneeFilter: (linearAssigneeFilter: string | null) => void;
	setIncludeClosedIssues: (includeClosedIssues: boolean) => void;
}

type PersistedTasksFilterState = Pick<
	TasksFilterState,
	| "tab"
	| "viewMode"
	| "typeTab"
	| "projectFilters"
	| "linearTeamFilter"
	| "linearAssigneeFilter"
	| "includeClosedIssues"
>;

export function migrateTasksFilterState(
	persistedState: unknown,
): PersistedTasksFilterState {
	const state =
		persistedState && typeof persistedState === "object"
			? (persistedState as Record<string, unknown>)
			: {};
	return {
		tab: isFilterTab(state.tab) ? state.tab : "all",
		typeTab:
			state.typeTab === "issues" || state.typeTab === "linear"
				? state.typeTab
				: "tasks",
		viewMode: state.viewMode === "board" ? "board" : "table",
		includeClosedIssues: state.includeClosedIssues === true,
		projectFilters: normalizeProjectFilters(
			state.projectFilters ??
				(typeof state.projectFilter === "string" ? [state.projectFilter] : []),
		),
		linearTeamFilter:
			typeof state.linearTeamFilter === "string"
				? state.linearTeamFilter
				: null,
		linearAssigneeFilter:
			typeof state.linearAssigneeFilter === "string"
				? state.linearAssigneeFilter
				: null,
	};
}

export const useTasksFilterStore = create<TasksFilterState>()(
	persist(
		(set) => ({
			tab: "all",
			assignee: null,
			search: "",
			viewMode: "table",
			typeTab: "tasks",
			projectFilters: [],
			linearTeamFilter: null,
			linearAssigneeFilter: null,
			includeClosedIssues: false,
			setTab: (tab) => set({ tab }),
			setAssignee: (assignee) => set({ assignee }),
			setSearch: (search) => set({ search }),
			setViewMode: (viewMode) => set({ viewMode }),
			setTypeTab: (typeTab) => set({ typeTab }),
			// Bail on equal content: views sync filters back through an effect,
			// so an always-fresh array here becomes an infinite update loop.
			setProjectFilters: (projectFilters) =>
				set((state) => {
					const next = normalizeProjectFilters(projectFilters);
					return areProjectFiltersEqual(state.projectFilters, next)
						? state
						: { projectFilters: next };
				}),
			setLinearTeamFilter: (linearTeamFilter) => set({ linearTeamFilter }),
			setLinearAssigneeFilter: (linearAssigneeFilter) =>
				set({ linearAssigneeFilter }),
			setIncludeClosedIssues: (includeClosedIssues) =>
				set({ includeClosedIssues }),
		}),
		{
			name: "tasks-filter-state",
			version: 6,
			migrate: migrateTasksFilterState,
			partialize: (state) => ({
				projectFilters: state.projectFilters,
				linearTeamFilter: state.linearTeamFilter,
				linearAssigneeFilter: state.linearAssigneeFilter,
				tab: state.tab,
				typeTab: state.typeTab,
				viewMode: state.viewMode,
				includeClosedIssues: state.includeClosedIssues,
			}),
		},
	),
);

export interface TasksFilters {
	tab: FilterTab;
	assignee: string | null;
	search: string;
	typeTab: TypeTab;
	projectFilters: string[];
	includeClosedIssues: boolean;
}

export function tasksSearchFromFilters(
	filters: TasksFilters,
): Record<string, string> {
	const out: Record<string, string> = {};
	if (filters.tab !== "all") out.tab = filters.tab;
	if (filters.assignee) out.assignee = filters.assignee;
	if (filters.search) out.search = filters.search;
	if (filters.typeTab !== "tasks") out.type = filters.typeTab;
	const projects = serializeProjectFilters(filters.projectFilters);
	if (projects) out.projects = projects;
	if (filters.typeTab === "issues" && filters.includeClosedIssues)
		out.state = "all";
	return out;
}
