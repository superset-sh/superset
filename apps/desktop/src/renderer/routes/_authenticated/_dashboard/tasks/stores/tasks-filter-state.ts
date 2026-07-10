import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "table" | "board";
export type TypeTab = "tasks" | "prs" | "issues";
export type FilterTab = "all" | "active" | "backlog";

interface TasksFilterState {
	tab: FilterTab;
	assignee: string | null;
	search: string;
	viewMode: ViewMode;
	typeTab: TypeTab;
	projectFilter: string | null;
	setTab: (tab: FilterTab) => void;
	setAssignee: (assignee: string | null) => void;
	setSearch: (search: string) => void;
	setViewMode: (viewMode: ViewMode) => void;
	setTypeTab: (typeTab: TypeTab) => void;
	setProjectFilter: (projectFilter: string | null) => void;
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
			setTab: (tab) => set({ tab }),
			setAssignee: (assignee) => set({ assignee }),
			setSearch: (search) => set({ search }),
			setViewMode: (viewMode) => set({ viewMode }),
			setTypeTab: (typeTab) => set({ typeTab }),
			setProjectFilter: (projectFilter) => set({ projectFilter }),
		}),
		{
			name: "tasks-filter-state",
			version: 1,
			partialize: (state) => ({
				projectFilter: state.projectFilter,
				tab: state.tab,
				typeTab: state.typeTab,
				viewMode: state.viewMode,
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
	return out;
}
