import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedSearchNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDebouncedSearchNavigation";
import { useProjectQueryTargets } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { normalizeAuthorFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/normalizeAuthorFilter";
import {
	normalizePullRequestReviewFilter,
	type PullRequestReviewFilter,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import {
	type PullRequestStateFilter,
	pullRequestsSearchFromFilters,
	usePullRequestsFilterStore,
} from "../../stores/pullRequestsFilterStore";
import { PullRequestsContent } from "./components/PullRequestsContent";
import { PullRequestsTopBar } from "./components/PullRequestsTopBar";

interface PullRequestsViewProps {
	initialSearch?: string;
	initialProjects?: string[];
	initialAuthor?: string;
	initialReview?: string;
	initialState?: "open" | "all" | "merged";
}

export function PullRequestsView({
	initialSearch,
	initialProjects,
	initialAuthor,
	initialReview,
	initialState,
}: PullRequestsViewProps) {
	const navigate = useNavigate();
	const {
		search: storedSearch,
		projectFilters: storedProjectFilters,
		authorFilter: storedAuthorFilter,
		reviewFilter: storedReviewFilter,
		stateFilter: storedStateFilter,
		setSearch: storeSetSearch,
		setProjectFilters: storeSetProjectFilters,
		setAuthorFilter: storeSetAuthorFilter,
		setReviewFilter: storeSetReviewFilter,
		setStateFilter: storeSetStateFilter,
	} = usePullRequestsFilterStore();
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? storedSearch);
	const projectFilters = initialProjects ?? storedProjectFilters;
	const authorFilter =
		initialAuthor === undefined
			? storedAuthorFilter
			: normalizeAuthorFilter(initialAuthor);
	const reviewFilter =
		initialReview === undefined
			? storedReviewFilter
			: normalizePullRequestReviewFilter(initialReview);
	const stateFilter: PullRequestStateFilter =
		initialState === undefined ? storedStateFilter : initialState;
	const {
		isReady: areProjectsReady,
		projects: hostProjects,
		targets: projectTargets,
	} = useProjectQueryTargets(projectFilters);

	// Sync only from the URL: depending on storedSearch would snap the input
	// back to the stale URL value on every keystroke until the debounced
	// navigation lands.
	useEffect(() => {
		if (initialSearch !== undefined) setSearchQuery(initialSearch);
	}, [initialSearch]);

	useEffect(() => {
		storeSetSearch(searchQuery);
	}, [searchQuery, storeSetSearch]);

	const buildSearch = useCallback(
		(overrides: {
			search?: string;
			projects?: string[];
			author?: string | null;
			review?: PullRequestReviewFilter | null;
			state?: PullRequestStateFilter;
		}) =>
			pullRequestsSearchFromFilters({
				search: overrides.search ?? searchQuery,
				projectFilters:
					overrides.projects !== undefined
						? overrides.projects
						: projectFilters,
				authorFilter:
					overrides.author !== undefined ? overrides.author : authorFilter,
				reviewFilter:
					overrides.review !== undefined ? overrides.review : reviewFilter,
				stateFilter: overrides.state ?? stateFilter,
			}),
		[authorFilter, stateFilter, projectFilters, reviewFilter, searchQuery],
	);
	const navigateSearch = useCallback(
		(query: string) => {
			navigate({
				to: "/pull-requests",
				search: buildSearch({ search: query }),
				replace: true,
			});
		},
		[buildSearch, navigate],
	);
	const {
		cancelPendingSearchNavigation,
		scheduleSearchNavigation: syncSearchToUrl,
	} = useDebouncedSearchNavigation(navigateSearch);

	useEffect(() => {
		storeSetProjectFilters(projectFilters);
	}, [projectFilters, storeSetProjectFilters]);

	useEffect(() => {
		storeSetAuthorFilter(authorFilter);
	}, [authorFilter, storeSetAuthorFilter]);

	useEffect(() => {
		storeSetReviewFilter(reviewFilter);
	}, [reviewFilter, storeSetReviewFilter]);

	useEffect(() => {
		storeSetStateFilter(stateFilter);
	}, [stateFilter, storeSetStateFilter]);

	const projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);

	useEffect(() => {
		if (!areProjectsReady) return;
		const availableIds = new Set(projects.map((project) => project.id));
		const availableFilters = projectFilters.filter((projectId) =>
			availableIds.has(projectId),
		);
		if (availableFilters.length === projectFilters.length) return;
		cancelPendingSearchNavigation();
		navigate({
			to: "/pull-requests",
			search: buildSearch({ projects: availableFilters }),
			replace: true,
		});
	}, [
		areProjectsReady,
		buildSearch,
		cancelPendingSearchNavigation,
		navigate,
		projectFilters,
		projects,
	]);

	const handleSearchChange = useCallback(
		(query: string) => {
			setSearchQuery(query);
			storeSetSearch(query);
			syncSearchToUrl(query);
		},
		[storeSetSearch, syncSearchToUrl],
	);

	const handleProjectFiltersChange = (projects: string[]) => {
		cancelPendingSearchNavigation();
		storeSetProjectFilters(projects);
		navigate({
			to: "/pull-requests",
			search: buildSearch({ projects }),
			replace: true,
		});
	};

	const handleStateFilterChange = (nextState: PullRequestStateFilter) => {
		cancelPendingSearchNavigation();
		storeSetStateFilter(nextState);
		navigate({
			to: "/pull-requests",
			search: buildSearch({ state: nextState }),
			replace: true,
		});
	};

	const handleAuthorFilterChange = (nextAuthor: string | null) => {
		cancelPendingSearchNavigation();
		storeSetAuthorFilter(nextAuthor);
		navigate({
			to: "/pull-requests",
			search: buildSearch({ author: nextAuthor }),
			replace: true,
		});
	};

	const handleReviewFilterChange = (
		nextReview: PullRequestReviewFilter | null,
	) => {
		cancelPendingSearchNavigation();
		storeSetReviewFilter(nextReview);
		navigate({
			to: "/pull-requests",
			search: buildSearch({ review: nextReview }),
			replace: true,
		});
	};

	return (
		<div
			data-pull-requests-view
			className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
		>
			<PullRequestsTopBar
				searchQuery={searchQuery}
				onSearchChange={handleSearchChange}
				projectFilters={projectFilters}
				onProjectFiltersChange={handleProjectFiltersChange}
				projectTargets={projectTargets}
				authorFilter={authorFilter}
				onAuthorFilterChange={handleAuthorFilterChange}
				reviewFilter={reviewFilter}
				onReviewFilterChange={handleReviewFilterChange}
				stateFilter={stateFilter}
				onStateFilterChange={handleStateFilterChange}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<PullRequestsContent
					projectFilters={projectFilters}
					projectTargets={projectTargets}
					areProjectsReady={areProjectsReady}
					hasProjects={projects.length > 0}
					searchQuery={searchQuery}
					authorFilter={authorFilter}
					reviewFilter={reviewFilter}
					stateFilter={stateFilter}
				/>
			</div>
		</div>
	);
}
