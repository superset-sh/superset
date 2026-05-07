import { create } from "zustand";

interface V2ProjectsFilterState {
	searchQuery: string;
	setSearchQuery: (searchQuery: string) => void;
	reset: () => void;
}

export const useV2ProjectsFilterStore = create<V2ProjectsFilterState>()(
	(set) => ({
		searchQuery: "",
		setSearchQuery: (searchQuery) => set({ searchQuery }),
		reset: () => set({ searchQuery: "" }),
	}),
);
