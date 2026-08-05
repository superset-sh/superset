import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "table" | "board";
export type TypeTab = "tasks" | "issues";
export type FilterTab = "all" | "active" | "backlog";

interface TasksFilterState {
	tab: FilterTab;
	assignee: string | null;
	search: string;
	viewMode: ViewMode;
	typeTab: TypeTab;
	projectFilter: string | null;
	linearProjectFilter: string | null;
	includeClosedIssues: boolean;
	setTab: (tab: FilterTab) => void;
	setAssignee: (assignee: string | null) => void;
	setSearch: (search: string) => void;
	setViewMode: (viewMode: ViewMode) => void;
	setTypeTab: (typeTab: TypeTab) => void;
	setProjectFilter: (projectFilter: string | null) => void;
	setLinearProjectFilter: (linearProjectFilter: string | null) => void;
	setIncludeClosedIssues: (includeClosedIssues: boolean) => void;
}

export function migrateTasksFilterState(
	persistedState: unknown,
): TasksFilterState {
	const state =
		persistedState && typeof persistedState === "object"
			? (persistedState as Record<string, unknown>)
			: {};
	return {
		...state,
		typeTab: state.typeTab === "issues" ? "issues" : "tasks",
		includeClosedIssues: state.includeClosedIssues === true,
	} as unknown as TasksFilterState;
}

export const useTasksFilterStore = create<TasksFilterState>()(
	persist(
		(set) => ({
			tab: "all",
			assignee: null,
			search: "",
			viewMode: "table",
			typeTab: "tasks",
			projectFilter: null,
			linearProjectFilter: null,
			includeClosedIssues: false,
			setTab: (tab) => set({ tab }),
			setAssignee: (assignee) => set({ assignee }),
			setSearch: (search) => set({ search }),
			setViewMode: (viewMode) => set({ viewMode }),
			setTypeTab: (typeTab) => set({ typeTab }),
			setProjectFilter: (projectFilter) => set({ projectFilter }),
			setLinearProjectFilter: (linearProjectFilter) =>
				set({ linearProjectFilter }),
			setIncludeClosedIssues: (includeClosedIssues) =>
				set({ includeClosedIssues }),
		}),
		{
			name: "tasks-filter-state",
			version: 3,
			migrate: migrateTasksFilterState,
			partialize: (state) => ({
				projectFilter: state.projectFilter,
				linearProjectFilter: state.linearProjectFilter,
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
	projectFilter: string | null;
	linearProjectFilter: string | null;
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
	if (filters.projectFilter) out.project = filters.projectFilter;
	if (filters.linearProjectFilter)
		out.linearProject = filters.linearProjectFilter;
	if (filters.typeTab === "issues" && filters.includeClosedIssues)
		out.state = "all";
	return out;
}
