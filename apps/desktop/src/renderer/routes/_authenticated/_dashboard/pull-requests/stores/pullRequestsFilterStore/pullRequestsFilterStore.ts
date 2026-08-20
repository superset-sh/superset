import {
	areProjectFiltersEqual,
	normalizeProjectFilters,
	serializeProjectFilters,
} from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { normalizeAuthorFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/normalizeAuthorFilter";
import {
	normalizePullRequestReviewFilter,
	type PullRequestReviewFilter,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PullRequestStateFilter = "open" | "all" | "merged";

interface PullRequestsFilterState {
	search: string;
	projectFilters: string[];
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	stateFilter: PullRequestStateFilter;
	setSearch: (search: string) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setAuthorFilter: (authorFilter: string | null) => void;
	setReviewFilter: (reviewFilter: PullRequestReviewFilter | null) => void;
	setStateFilter: (stateFilter: PullRequestStateFilter) => void;
}

type PersistedPullRequestsFilterState = Pick<
	PullRequestsFilterState,
	"projectFilters" | "authorFilter" | "reviewFilter" | "stateFilter"
>;

function normalizeStateFilter(value: unknown): PullRequestStateFilter {
	return value === "all" || value === "merged" ? value : "open";
}

export function migratePullRequestsFilterState(
	persistedState: unknown,
): PersistedPullRequestsFilterState {
	const state =
		persistedState && typeof persistedState === "object"
			? (persistedState as Record<string, unknown>)
			: {};
	const legacyProject =
		typeof state.projectFilter === "string" ? state.projectFilter : null;
	return {
		projectFilters: normalizeProjectFilters(
			state.projectFilters ?? (legacyProject ? [legacyProject] : []),
		),
		authorFilter: normalizeAuthorFilter(state.authorFilter),
		reviewFilter: normalizePullRequestReviewFilter(state.reviewFilter),
		// v4 persisted a boolean `includeClosed`; v5 replaces it with a
		// tri-state `stateFilter` ("open" | "all" | "merged").
		stateFilter:
			"stateFilter" in state
				? normalizeStateFilter(state.stateFilter)
				: state.includeClosed === true
					? "all"
					: "open",
	};
}

export const usePullRequestsFilterStore = create<PullRequestsFilterState>()(
	persist(
		(set) => ({
			search: "",
			projectFilters: [],
			authorFilter: null,
			reviewFilter: null,
			stateFilter: "open",
			setSearch: (search) => set({ search }),
			// Bail on equal content: views sync filters back through an effect,
			// so an always-fresh array here becomes an infinite update loop.
			// Bail on equal content: views sync filters back through an effect,
			// so an always-fresh array here becomes an infinite update loop.
			setProjectFilters: (projectFilters) =>
				set((state) => {
					const next = normalizeProjectFilters(projectFilters);
					return areProjectFiltersEqual(state.projectFilters, next)
						? state
						: { projectFilters: next };
				}),
			setAuthorFilter: (authorFilter) =>
				set({ authorFilter: normalizeAuthorFilter(authorFilter) }),
			setReviewFilter: (reviewFilter) =>
				set({
					reviewFilter: normalizePullRequestReviewFilter(reviewFilter),
				}),
			setStateFilter: (stateFilter) => set({ stateFilter }),
		}),
		{
			name: "pull-requests-filter-state",
			version: 5,
			migrate: migratePullRequestsFilterState,
			partialize: (state) => ({
				projectFilters: state.projectFilters,
				authorFilter: state.authorFilter,
				reviewFilter: state.reviewFilter,
				stateFilter: state.stateFilter,
			}),
		},
	),
);

interface PullRequestsFilters {
	search: string;
	projectFilters: string[];
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	stateFilter: PullRequestStateFilter;
}

export function pullRequestsSearchFromFilters(
	filters: PullRequestsFilters,
): Record<string, string> {
	const search: Record<string, string> = {};
	if (filters.search) search.search = filters.search;
	const projects = serializeProjectFilters(filters.projectFilters);
	if (projects) search.projects = projects;
	if (filters.authorFilter) search.author = filters.authorFilter;
	if (filters.reviewFilter) search.review = filters.reviewFilter;
	if (filters.stateFilter !== "open") search.state = filters.stateFilter;
	return search;
}
