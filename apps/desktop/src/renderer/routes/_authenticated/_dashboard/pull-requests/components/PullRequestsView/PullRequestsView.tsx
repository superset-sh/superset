import { errorMessage } from "@superset/i18n/errors";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDebouncedSearchNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDebouncedSearchNavigation";
import {
	groupProjectTargetsByHost,
	useProjectQueryTargets,
} from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { normalizeAuthorFilters } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/normalizeAuthorFilter";
import {
	normalizePullRequestReviewFilter,
	type PullRequestReviewFilter,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";
import { getPullRequestSearchSelection } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter/pullRequestReviewFilter";
import { queryPullRequestSearchCapabilities } from "renderer/routes/_authenticated/_dashboard/utils/queryRepoSearchCapabilities";
import {
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
	/** The PR currently open in the detail pane, if any — filter/search
	 *  changes navigate back to it instead of collapsing the detail pane. */
	selectedPrNumber?: number | null;
	/** The open PR's own project id — distinct from the list's `projects`
	 *  filter, and must survive filter-driven re-navigations. */
	selectedPrProjectId?: string | null;
	selectedPrRepo?: string | null;
}

export function PullRequestsView({
	initialSearch,
	initialProjects,
	initialAuthor,
	initialReview,
	initialState,
	selectedPrNumber = null,
	selectedPrProjectId = null,
	selectedPrRepo = null,
}: PullRequestsViewProps) {
	const navigate = useNavigate();
	const {
		search: storedSearch,
		projectFilters: storedProjectFilters,
		authorFilter: storedAuthorFilter,
		reviewFilter: storedReviewFilter,
		includeClosed: storedIncludeClosed,
		mergedOnly: storedMergedOnly,
		setSearch: storeSetSearch,
		setProjectFilters: storeSetProjectFilters,
		setAuthorFilter: storeSetAuthorFilter,
		setReviewFilter: storeSetReviewFilter,
		setIncludeClosed: storeSetIncludeClosed,
		setMergedOnly: storeSetMergedOnly,
	} = usePullRequestsFilterStore();
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? storedSearch);
	const projectFilters = initialProjects ?? storedProjectFilters;
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
	// Filter/search changes must not collapse an open detail pane.
	const navigateTo = useCallback(
		(search: Record<string, string>) =>
			selectedPrNumber != null
				? navigate({
						to: "/pull-requests/$prNumber",
						params: { prNumber: String(selectedPrNumber) },
						search: {
							...search,
							project: selectedPrProjectId ?? undefined,
							repo: selectedPrRepo ?? undefined,
						},
						replace: true,
					})
				: navigate({ to: "/pull-requests", search, replace: true }),
		[navigate, selectedPrNumber, selectedPrProjectId, selectedPrRepo],
	);
	const {
		isReady: areProjectsReady,
		projects: hostProjects,
		targets: projectTargets,
	} = useProjectQueryTargets(projectFilters);
	const capabilityTargets = useMemo(
		() => groupProjectTargetsByHost(projectTargets),
		[projectTargets],
	);
	const capabilityQueries = useQueries({
		queries: capabilityTargets.map((target) => ({
			queryKey: [
				"pullRequests",
				"searchCapabilities",
				target.key,
				target.hostUrl,
			],
			enabled: !!target.hostUrl,
			queryFn: async () => {
				if (!target.hostUrl) return [];
				return queryPullRequestSearchCapabilities(
					getHostServiceClientByUrl(target.hostUrl),
					target.projects.map((project) => project.projectId),
				);
			},
			staleTime: 0,
			refetchInterval: 30_000,
			retry: false,
		})),
	});
	const capabilityFailure = capabilityQueries.find(
		(query) => query.isError,
	)?.error;
	const searchSelection = getPullRequestSearchSelection(
		capabilityQueries.flatMap((query) =>
			query.isError ? [] : (query.data ?? []),
		),
		projectTargets.length,
		capabilityQueries.some(
			(query, index) =>
				!!capabilityTargets[index]?.hostUrl &&
				query.data === undefined &&
				query.isPending,
		),
		capabilityFailure ? errorMessage(capabilityFailure) : undefined,
	);
	const rawAuthorFilter =
		initialAuthor === undefined
			? storedAuthorFilter
			: normalizeAuthorFilters(initialAuthor, "unknown");
	const authorFilter =
		searchSelection.mode === "github"
			? (normalizeAuthorFilters(rawAuthorFilter) ?? rawAuthorFilter)
			: rawAuthorFilter;

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
			}),
		[
			authorFilter,
			includeClosed,
			mergedOnly,
			projectFilters,
			reviewFilter,
			searchQuery,
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
		storeSetAuthorFilter(authorFilter, "unknown");
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
		storeSetAuthorFilter(nextAuthor, "unknown");
		navigateTo(buildSearch({ author: nextAuthor }));
	};

	const handleReviewFilterChange = (
		nextReview: PullRequestReviewFilter | null,
	) => {
		cancelPendingSearchNavigation();
		storeSetReviewFilter(nextReview);
		navigateTo(buildSearch({ review: nextReview }));
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
				searchQuery={searchQuery}
				onSearchChange={handleSearchChange}
				projectFilters={projectFilters}
				onProjectFiltersChange={handleProjectFiltersChange}
				projectTargets={projectTargets}
				searchSelection={searchSelection}
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
					includeClosed={includeClosed}
					mergedOnly={mergedOnly}
					selectedPrNumber={selectedPrNumber}
					selectedPrProjectId={selectedPrProjectId}
					repoSlugByProjectId={repoSlugByProjectId}
				/>
			</div>
		</div>
	);
}
