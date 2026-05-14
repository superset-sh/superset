import { create } from "zustand";

export type ViewMode = "table" | "board";
export type TypeTab = "tasks" | "prs" | "issues";

interface TasksFilterState {
	tab: "all" | "active" | "backlog";
	assignee: string | null;
	search: string;
	viewMode: ViewMode;
	typeTab: TypeTab;
	projectFilter: string | null;
	setTab: (tab: "all" | "active" | "backlog") => void;
	setAssignee: (assignee: string | null) => void;
	setSearch: (search: string) => void;
	setViewMode: (viewMode: ViewMode) => void;
	setTypeTab: (typeTab: TypeTab) => void;
	setProjectFilter: (projectFilter: string | null) => void;
}

export const useTasksFilterStore = create<TasksFilterState>()((set) => ({
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
}));
