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
	normalizePullRequestsViewTab,
	type PullRequestsViewTab,
	viewerRelationshipForTab,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/viewerRelationship";
import {
	pullRequestsSearchFromFilters,
	usePullRequestsFilterStore,
} from "../../stores/pullRequestsFilterStore";
import { PullRequestsContent } from "./components/PullRequestsContent";
import { PullRequestsGroupedContent } from "./components/PullRequestsGroupedContent";
import { PullRequestsReviewingContent } from "./components/PullRequestsReviewingContent";
import { PullRequestsTopBar } from "./components/PullRequestsTopBar";

interface PullRequestsViewProps {
	initialSearch?: string;
	initialProjects?: string[];
	initialAuthor?: string;
	initialReview?: string;
	initialState?: "open" | "all" | "merged";
	initialViewTab?: "all" | "reviewing" | "authored";
	/** The PR currently open in the detail pane, if any — filter/search
	 *  changes navigate back to it instead of collapsing the detail pane. */
	selectedPrNumber?: number | null;
	/** The open PR's own project id — distinct from the list's `projects`
	 *  filter, and must survive filter-driven re-navigations. */
	selectedPrProjectId?: string | null;
}

export function PullRequestsView({
	initialSearch,
	initialProjects,
	initialAuthor,
	initialReview,
	initialState,
	initialViewTab,
	selectedPrNumber = null,
	selectedPrProjectId = null,
}: PullRequestsViewProps) {
	const navigate = useNavigate();
	const {
		search: storedSearch,
		projectFilters: storedProjectFilters,
		authorFilter: storedAuthorFilter,
		reviewFilter: storedReviewFilter,
		includeClosed: storedIncludeClosed,
		mergedOnly: storedMergedOnly,
		viewTab: storedViewTab,
		setSearch: storeSetSearch,
		setProjectFilters: storeSetProjectFilters,
		setAuthorFilter: storeSetAuthorFilter,
		setReviewFilter: storeSetReviewFilter,
		setIncludeClosed: storeSetIncludeClosed,
		setMergedOnly: storeSetMergedOnly,
		setViewTab: storeSetViewTab,
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
	const includeClosed =
		initialState === undefined
			? storedIncludeClosed
			: initialState === "all" || initialState === "merged";
	const mergedOnly =
		initialState === undefined ? storedMergedOnly : initialState === "merged";
	const viewTab: PullRequestsViewTab =
		initialViewTab === undefined
			? storedViewTab
			: normalizePullRequestsViewTab(initialViewTab);
	// Filter/search changes must not collapse an open detail pane.
	const navigateTo = useCallback(
		(search: Record<string, string>) =>
			selectedPrNumber != null
				? navigate({
						to: "/pull-requests/$prNumber",
						params: { prNumber: String(selectedPrNumber) },
						search: selectedPrProjectId
							? { ...search, project: selectedPrProjectId }
							: search,
						replace: true,
					})
				: navigate({ to: "/pull-requests", search, replace: true }),
		[navigate, selectedPrNumber, selectedPrProjectId],
	);
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
			includeClosed?: boolean;
			mergedOnly?: boolean;
			viewTab?: PullRequestsViewTab;
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
				includeClosed: overrides.includeClosed ?? includeClosed,
				mergedOnly: overrides.mergedOnly ?? mergedOnly,
				viewTab: overrides.viewTab ?? viewTab,
			}),
		[
			authorFilter,
			includeClosed,
			mergedOnly,
			projectFilters,
			reviewFilter,
			searchQuery,
			viewTab,
		],
	);
	const navigateSearch = useCallback(
		(query: string) => navigateTo(buildSearch({ search: query })),
		[buildSearch, navigateTo],
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
		storeSetIncludeClosed(includeClosed);
	}, [includeClosed, storeSetIncludeClosed]);

	useEffect(() => {
		storeSetMergedOnly(mergedOnly);
	}, [mergedOnly, storeSetMergedOnly]);

	useEffect(() => {
		storeSetViewTab(viewTab);
	}, [viewTab, storeSetViewTab]);

	const projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);
	const repoSlugByProjectId = useMemo(
		() =>
			new Map(
				hostProjects.map((project) => [
					project.projectKey,
					project.repoOwner && project.repoName
						? `${project.repoOwner}/${project.repoName}`
						: project.name,
				]),
			),
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
		navigateTo(buildSearch({ projects: availableFilters }));
	}, [
		areProjectsReady,
		buildSearch,
		cancelPendingSearchNavigation,
		navigateTo,
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
		navigateTo(buildSearch({ projects }));
	};

	/** Drives the All / Open / Merged segmented control as one control. */
	const handleStateFilterChange = (next: "open" | "all" | "merged") => {
		cancelPendingSearchNavigation();
		const nextIncludeClosed = next !== "open";
		const nextMergedOnly = next === "merged";
		storeSetIncludeClosed(nextIncludeClosed);
		storeSetMergedOnly(nextMergedOnly);
		navigateTo(
			buildSearch({
				includeClosed: nextIncludeClosed,
				mergedOnly: nextMergedOnly,
			}),
		);
	};

	const handleAuthorFilterChange = (nextAuthor: string | null) => {
		cancelPendingSearchNavigation();
		storeSetAuthorFilter(nextAuthor);
		navigateTo(buildSearch({ author: nextAuthor }));
	};

	const handleReviewFilterChange = (
		nextReview: PullRequestReviewFilter | null,
	) => {
		cancelPendingSearchNavigation();
		storeSetReviewFilter(nextReview);
		navigateTo(buildSearch({ review: nextReview }));
	};

	const handleViewTabChange = (nextViewTab: PullRequestsViewTab) => {
		cancelPendingSearchNavigation();
		storeSetViewTab(nextViewTab);
		navigateTo(buildSearch({ viewTab: nextViewTab }));
	};

	const stateFilter: "open" | "all" | "merged" = mergedOnly
		? "merged"
		: includeClosed
			? "all"
			: "open";

	return (
		<div
			data-pull-requests-view
			className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
		>
			<PullRequestsTopBar
				viewTab={viewTab}
				onViewTabChange={handleViewTabChange}
				searchQuery={searchQuery}
				onSearchChange={handleSearchChange}
				projectFilters={projectFilters}
				onProjectFiltersChange={handleProjectFiltersChange}
				authorFilter={authorFilter}
				onAuthorFilterChange={handleAuthorFilterChange}
				reviewFilter={reviewFilter}
				onReviewFilterChange={handleReviewFilterChange}
				stateFilter={stateFilter}
				onStateFilterChange={handleStateFilterChange}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{viewTab === "all" ? (
					<PullRequestsGroupedContent
						projectFilters={projectFilters}
						projectTargets={projectTargets}
						areProjectsReady={areProjectsReady}
						hasProjects={projects.length > 0}
						searchQuery={searchQuery}
						authorFilter={authorFilter}
						reviewFilter={reviewFilter}
						includeClosed={includeClosed}
						mergedOnly={mergedOnly}
						selectedPrNumber={selectedPrNumber}
						selectedPrProjectId={selectedPrProjectId}
						repoSlugByProjectId={repoSlugByProjectId}
						onViewTabChange={handleViewTabChange}
					/>
				) : viewTab === "reviewing" ? (
					<PullRequestsReviewingContent
						projectFilters={projectFilters}
						projectTargets={projectTargets}
						areProjectsReady={areProjectsReady}
						hasProjects={projects.length > 0}
						searchQuery={searchQuery}
						authorFilter={authorFilter}
						reviewFilter={reviewFilter}
						includeClosed={includeClosed}
						mergedOnly={mergedOnly}
						selectedPrNumber={selectedPrNumber}
						selectedPrProjectId={selectedPrProjectId}
						repoSlugByProjectId={repoSlugByProjectId}
					/>
				) : (
					<PullRequestsContent
						projectFilters={projectFilters}
						projectTargets={projectTargets}
						areProjectsReady={areProjectsReady}
						hasProjects={projects.length > 0}
						searchQuery={searchQuery}
						authorFilter={authorFilter}
						reviewFilter={reviewFilter}
						includeClosed={includeClosed}
						mergedOnly={mergedOnly}
						viewerRelationship={viewerRelationshipForTab(viewTab)}
						selectedPrNumber={selectedPrNumber}
						selectedPrProjectId={selectedPrProjectId}
						repoSlugByProjectId={repoSlugByProjectId}
					/>
				)}
			</div>
		</div>
	);
}
