import { create } from "zustand";

interface TasksFilterState {
	tab: "all" | "active" | "backlog";
	assignee: string | null;
	search: string;
	setTab: (tab: "all" | "active" | "backlog") => void;
	setAssignee: (assignee: string | null) => void;
	setSearch: (search: string) => void;
}

export const useTasksFilterStore = create<TasksFilterState>()((set) => ({
	tab: "all",
	assignee: null,
	search: "",
	setTab: (tab) => set({ tab }),
	setAssignee: (assignee) => set({ assignee }),
	setSearch: (search) => set({ search }),
}));
