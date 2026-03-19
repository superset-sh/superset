import { create } from "zustand";

export type ViewMode = "table" | "board";

interface TasksFilterState {
	tab: "all" | "active" | "backlog";
	assignee: string | null;
	search: string;
	viewMode: ViewMode;
	setTab: (tab: "all" | "active" | "backlog") => void;
	setAssignee: (assignee: string | null) => void;
	setSearch: (search: string) => void;
	setViewMode: (viewMode: ViewMode) => void;
}

export const useTasksFilterStore = create<TasksFilterState>()((set) => ({
	tab: "all",
	assignee: null,
	search: "",
	viewMode: "table",
	setTab: (tab) => set({ tab }),
	setAssignee: (assignee) => set({ assignee }),
	setSearch: (search) => set({ search }),
	setViewMode: (viewMode) => set({ viewMode }),
}));
