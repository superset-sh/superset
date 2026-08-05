import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import {
	pullRequestsSearchFromFilters,
	usePullRequestsFilterStore,
} from "../../stores/pullRequestsFilterStore";
import { PullRequestsContent } from "./components/PullRequestsContent";
import { PullRequestsTopBar } from "./components/PullRequestsTopBar";

interface PullRequestsViewProps {
	initialSearch?: string;
	initialProject?: string;
	initialState?: "open" | "all";
}

export function PullRequestsView({
	initialSearch,
	initialProject,
	initialState,
}: PullRequestsViewProps) {
	const navigate = useNavigate();
	const {
		projectFilter: storedProjectFilter,
		includeClosed: storedIncludeClosed,
		setSearch: storeSetSearch,
		setProjectFilter: storeSetProjectFilter,
		setIncludeClosed: storeSetIncludeClosed,
	} = usePullRequestsFilterStore();
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
	const projectFilter = initialProject ?? storedProjectFilter;
	const includeClosed =
		initialState === undefined ? storedIncludeClosed : initialState === "all";
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
	const {
		hostId: projectHostId,
		isReady: areProjectsReady,
		project: selectedProject,
		projects: hostProjects,
	} = useProjectHost(projectFilter);

	useEffect(() => {
		setSearchQuery(initialSearch ?? "");
	}, [initialSearch]);

	useEffect(() => {
		storeSetSearch(searchQuery);
	}, [searchQuery, storeSetSearch]);

	const buildSearch = useCallback(
		(overrides: {
			search?: string;
			project?: string | null;
			includeClosed?: boolean;
		}) =>
			pullRequestsSearchFromFilters({
				search: overrides.search ?? searchQuery,
				projectFilter:
					overrides.project !== undefined ? overrides.project : projectFilter,
				includeClosed: overrides.includeClosed ?? includeClosed,
			}),
		[includeClosed, projectFilter, searchQuery],
	);

	const syncSearchToUrl = useCallback(
		(query: string) => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				navigate({
					to: "/pull-requests",
					search: buildSearch({ search: query }),
					replace: true,
				});
			}, 300);
		},
		[buildSearch, navigate],
	);

	useEffect(
		() => () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		},
		[],
	);

	useEffect(() => {
		storeSetProjectFilter(projectFilter);
	}, [projectFilter, storeSetProjectFilter]);

	useEffect(() => {
		storeSetIncludeClosed(includeClosed);
	}, [includeClosed, storeSetIncludeClosed]);

	const projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);

	useEffect(() => {
		if (
			projectFilter &&
			projects.some((project) => project.id === projectFilter)
		)
			return;
		if (!areProjectsReady) return;
		const firstProject = projects[0];
		if (!firstProject) return;
		navigate({
			to: "/pull-requests",
			search: buildSearch({ project: firstProject.id }),
			replace: true,
		});
	}, [areProjectsReady, buildSearch, navigate, projectFilter, projects]);

	const handleSearchChange = useCallback(
		(query: string) => {
			setSearchQuery(query);
			storeSetSearch(query);
			syncSearchToUrl(query);
		},
		[storeSetSearch, syncSearchToUrl],
	);

	const handleProjectFilterChange = (project: string) => {
		storeSetProjectFilter(project);
		navigate({
			to: "/pull-requests",
			search: buildSearch({ project }),
			replace: true,
		});
	};

	const handleIncludeClosedChange = (nextIncludeClosed: boolean) => {
		storeSetIncludeClosed(nextIncludeClosed);
		navigate({
			to: "/pull-requests",
			search: buildSearch({ includeClosed: nextIncludeClosed }),
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
				projectFilter={projectFilter}
				onProjectFilterChange={handleProjectFilterChange}
				includeClosed={includeClosed}
				onIncludeClosedChange={handleIncludeClosedChange}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<PullRequestsContent
					projectFilter={selectedProject?.projectKey ?? null}
					hostId={projectHostId}
					areProjectsReady={areProjectsReady}
					hasProjects={projects.length > 0}
					searchQuery={searchQuery}
					includeClosed={includeClosed}
				/>
			</div>
		</div>
	);
}
