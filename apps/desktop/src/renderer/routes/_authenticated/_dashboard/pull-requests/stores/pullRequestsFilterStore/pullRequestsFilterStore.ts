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

interface PullRequestsFilterState {
	search: string;
	projectFilters: string[];
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	includeClosed: boolean;
	/** Narrows further to merged-only — independent of includeClosed, which
	 *  the "is:merged" qualifier takes precedence over on the backend. */
	mergedOnly: boolean;
	setSearch: (search: string) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setAuthorFilter: (authorFilter: string | null) => void;
	setReviewFilter: (reviewFilter: PullRequestReviewFilter | null) => void;
	setIncludeClosed: (includeClosed: boolean) => void;
	setMergedOnly: (mergedOnly: boolean) => void;
}

type PersistedPullRequestsFilterState = Pick<
	PullRequestsFilterState,
	| "projectFilters"
	| "authorFilter"
	| "reviewFilter"
	| "includeClosed"
	| "mergedOnly"
>;

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
		includeClosed: state.includeClosed === true,
		mergedOnly: state.mergedOnly === true,
	};
}

export const usePullRequestsFilterStore = create<PullRequestsFilterState>()(
	persist(
		(set) => ({
			search: "",
			projectFilters: [],
			authorFilter: null,
			reviewFilter: null,
			includeClosed: false,
			mergedOnly: false,
			setSearch: (search) => set({ search }),
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
			setIncludeClosed: (includeClosed) => set({ includeClosed }),
			setMergedOnly: (mergedOnly) => set({ mergedOnly }),
		}),
		{
			name: "pull-requests-filter-state",
			version: 7,
			migrate: migratePullRequestsFilterState,
			partialize: (state) => ({
				projectFilters: state.projectFilters,
				authorFilter: state.authorFilter,
				reviewFilter: state.reviewFilter,
				includeClosed: state.includeClosed,
				mergedOnly: state.mergedOnly,
			}),
		},
	),
);

interface PullRequestsFilters {
	search: string;
	projectFilters: string[];
	authorFilter: string | null;
	reviewFilter: PullRequestReviewFilter | null;
	includeClosed: boolean;
	mergedOnly: boolean;
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
	if (filters.mergedOnly) search.state = "merged";
	else if (filters.includeClosed) search.state = "all";
	return search;
}
