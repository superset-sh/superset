import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PullRequestsFilterState {
	search: string;
	projectFilter: string | null;
	includeClosed: boolean;
	setSearch: (search: string) => void;
	setProjectFilter: (projectFilter: string | null) => void;
	setIncludeClosed: (includeClosed: boolean) => void;
}

export const usePullRequestsFilterStore = create<PullRequestsFilterState>()(
	persist(
		(set) => ({
			search: "",
			projectFilter: null,
			includeClosed: false,
			setSearch: (search) => set({ search }),
			setProjectFilter: (projectFilter) => set({ projectFilter }),
			setIncludeClosed: (includeClosed) => set({ includeClosed }),
		}),
		{
			name: "pull-requests-filter-state",
			version: 1,
			partialize: (state) => ({
				projectFilter: state.projectFilter,
				includeClosed: state.includeClosed,
			}),
		},
	),
);

interface PullRequestsFilters {
	search: string;
	projectFilter: string | null;
	includeClosed: boolean;
}

export function pullRequestsSearchFromFilters(
	filters: PullRequestsFilters,
): Record<string, string> {
	const search: Record<string, string> = {};
	if (filters.search) search.search = filters.search;
	if (filters.projectFilter) search.project = filters.projectFilter;
	if (filters.includeClosed) search.state = "all";
	return search;
}
