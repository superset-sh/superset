import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useDebouncedSearchNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDebouncedSearchNavigation";
import { useProjectQueryTargets } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import {
	tasksSearchFromFilters,
	useTasksFilterStore,
} from "../../stores/tasks-filter-state";
import { BoardContent } from "./components/BoardContent";
import {
	GitHubIssuesContent,
	type SelectedIssue,
} from "./components/GitHubIssuesContent";
import { LinearCTA } from "./components/LinearCTA";
import { TableContent } from "./components/TableContent";
import {
	type TabValue,
	type TaskSource,
	TasksTopBar,
} from "./components/TasksTopBar";
import type { TaskWithStatus } from "./hooks/useTasksData";

interface TasksViewProps {
	initialTab?: TabValue;
	initialAssignee?: string;
	initialSearch?: string;
	initialType?: "tasks" | "issues";
	initialProjects?: string[];
	initialLinearProject?: string;
	initialState?: "open" | "all";
}

export function TasksView({
	initialTab,
	initialAssignee,
	initialSearch,
	initialType,
	initialProjects,
	initialLinearProject,
	initialState,
}: TasksViewProps) {
	const navigate = useNavigate();
	const activeOrganizationId = useActiveOrganizationId();
	const {
		tab: storedTab,
		assignee: storedAssignee,
		search: storedSearch,
		typeTab: storedTypeTab,
		projectFilters: storedProjectFilters,
		linearProjectFilter: storedLinearProjectFilter,
		setTab: storeSetTab,
		setAssignee: storeSetAssignee,
		setSearch: storeSetSearch,
		setTypeTab: storeSetTypeTab,
		setProjectFilters: storeSetProjectFilters,
		setLinearProjectFilter: storeSetLinearProjectFilter,
		includeClosedIssues: storedIncludeClosedIssues,
		setIncludeClosedIssues: storeSetIncludeClosedIssues,
		viewMode,
		setViewMode,
	} = useTasksFilterStore();
	const currentTab: TabValue = initialTab ?? storedTab;
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? storedSearch);
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const assigneeFilter = initialAssignee ?? storedAssignee;
	const typeTab = initialType ?? storedTypeTab;
	const projectFilters = initialProjects ?? storedProjectFilters;
	const linearProjectFilter = initialLinearProject ?? storedLinearProjectFilter;
	const includeClosedIssues =
		initialState === undefined
			? storedIncludeClosedIssues
			: initialState === "all";

	// Sync only from the URL: depending on storedSearch would snap the input
	// back to the stale URL value on every keystroke until the debounced
	// navigation lands.
	useEffect(() => {
		if (initialSearch !== undefined) setSearchQuery(initialSearch);
	}, [initialSearch]);

	const buildSearch = useCallback(
		(overrides: {
			tab?: TabValue;
			assignee?: string | null;
			search?: string;
			type?: "tasks" | "issues";
			projects?: string[];
			linearProject?: string | null;
			includeClosedIssues?: boolean;
		}) =>
			tasksSearchFromFilters({
				tab: overrides.tab ?? currentTab,
				assignee:
					overrides.assignee !== undefined
						? overrides.assignee
						: assigneeFilter,
				search: overrides.search !== undefined ? overrides.search : searchQuery,
				typeTab: overrides.type ?? typeTab,
				projectFilters:
					overrides.projects !== undefined
						? overrides.projects
						: projectFilters,
				linearProjectFilter:
					overrides.linearProject !== undefined
						? overrides.linearProject
						: linearProjectFilter,
				includeClosedIssues:
					overrides.includeClosedIssues ?? includeClosedIssues,
			}),
		[
			currentTab,
			assigneeFilter,
			searchQuery,
			typeTab,
			projectFilters,
			linearProjectFilter,
			includeClosedIssues,
		],
	);
	const navigateSearch = useCallback(
		(query: string) => {
			navigate({
				to: "/tasks",
				search: buildSearch({ search: query }),
				replace: true,
			});
		},
		[navigate, buildSearch],
	);
	const {
		cancelPendingSearchNavigation,
		scheduleSearchNavigation: syncSearchToUrl,
	} = useDebouncedSearchNavigation(navigateSearch);

	const handleSearchChange = useCallback(
		(query: string) => {
			setSearchQuery(query);
			storeSetSearch(query);
			syncSearchToUrl(query);
		},
		[storeSetSearch, syncSearchToUrl],
	);

	useEffect(() => {
		storeSetTab(currentTab);
	}, [currentTab, storeSetTab]);

	useEffect(() => {
		storeSetAssignee(assigneeFilter);
	}, [assigneeFilter, storeSetAssignee]);

	useEffect(() => {
		storeSetSearch(searchQuery);
	}, [searchQuery, storeSetSearch]);

	useEffect(() => {
		storeSetTypeTab(typeTab);
	}, [typeTab, storeSetTypeTab]);

	useEffect(() => {
		storeSetProjectFilters(projectFilters);
	}, [projectFilters, storeSetProjectFilters]);

	useEffect(() => {
		storeSetLinearProjectFilter(linearProjectFilter);
	}, [linearProjectFilter, storeSetLinearProjectFilter]);

	useEffect(() => {
		storeSetIncludeClosedIssues(includeClosedIssues);
	}, [includeClosedIssues, storeSetIncludeClosedIssues]);

	const { data: integrations } = cloudTrpc.integration.list.useQuery(
		{ organizationId: activeOrganizationId ?? "" },
		{ enabled: !!activeOrganizationId },
	);

	// Projects are fully local — identity comes from the host fan-out.
	const {
		isReady: areProjectsReady,
		projects: hostProjects,
		targets: projectTargets,
	} = useProjectQueryTargets(projectFilters);
	const v2Projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);

	useEffect(() => {
		if (!areProjectsReady) return;
		const availableIds = new Set(v2Projects.map((project) => project.id));
		const availableFilters = projectFilters.filter((projectId) =>
			availableIds.has(projectId),
		);
		if (availableFilters.length === projectFilters.length) return;
		cancelPendingSearchNavigation();
		navigate({
			to: "/tasks",
			search: buildSearch({ projects: availableFilters }),
			replace: true,
		});
	}, [
		areProjectsReady,
		projectFilters,
		v2Projects,
		cancelPendingSearchNavigation,
		navigate,
		buildSearch,
	]);

	const isLinearConnected =
		integrations?.some((i) => i.provider === "linear") ?? false;

	// Defaults ("all"/null) are omitted from the URL, so write the store too —
	// otherwise the render falls back to the stale stored value (no-op select).
	const handleTabChange = (tab: TabValue) => {
		cancelPendingSearchNavigation();
		storeSetTab(tab);
		navigate({ to: "/tasks", search: buildSearch({ tab }), replace: true });
	};

	const handleAssigneeFilterChange = (assignee: string | null) => {
		cancelPendingSearchNavigation();
		storeSetAssignee(assignee);
		navigate({
			to: "/tasks",
			search: buildSearch({ assignee }),
			replace: true,
		});
	};

	const navigateToType = (type: TaskSource, resetSearch: boolean) => {
		const nextSearch = resetSearch ? "" : searchQuery;
		storeSetTypeTab(type);
		cancelPendingSearchNavigation();
		if (resetSearch) {
			setSearchQuery("");
			storeSetSearch("");
		}
		navigate({
			to: "/tasks",
			search: buildSearch({ type, search: nextSearch }),
			replace: true,
		});
	};

	const handleTaskSourceChange = (source: TaskSource) => {
		navigateToType(source, true);
	};

	const handleProjectFiltersChange = (projects: string[]) => {
		cancelPendingSearchNavigation();
		storeSetProjectFilters(projects);
		navigate({
			to: "/tasks",
			search: buildSearch({ projects }),
			replace: true,
		});
	};

	const handleLinearProjectFilterChange = (linearProject: string | null) => {
		cancelPendingSearchNavigation();
		storeSetLinearProjectFilter(linearProject);
		navigate({
			to: "/tasks",
			search: buildSearch({ linearProject }),
			replace: true,
		});
	};

	const handleIncludeClosedIssuesChange = (nextIncludeClosed: boolean) => {
		cancelPendingSearchNavigation();
		storeSetIncludeClosedIssues(nextIncludeClosed);
		navigate({
			to: "/tasks",
			search: buildSearch({ includeClosedIssues: nextIncludeClosed }),
			replace: true,
		});
	};

	const [selectedTasks, setSelectedTasks] = useState<TaskWithStatus[]>([]);
	const clearSelectionRef = useRef<(() => void) | null>(null);

	const handleSelectionChange = useCallback(
		(tasks: TaskWithStatus[], clearSelection: () => void) => {
			setSelectedTasks(tasks);
			clearSelectionRef.current = clearSelection;
		},
		[],
	);

	const handleClearSelection = useCallback(() => {
		clearSelectionRef.current?.();
	}, []);

	const [selectedIssues, setSelectedIssues] = useState<SelectedIssue[]>([]);
	const clearIssueSelectionRef = useRef<(() => void) | null>(null);

	const handleIssueSelectionChange = useCallback(
		(issues: SelectedIssue[], clearSelection: () => void) => {
			setSelectedIssues(issues);
			clearIssueSelectionRef.current = clearSelection;
		},
		[],
	);

	const handleClearIssueSelection = useCallback(() => {
		clearIssueSelectionRef.current?.();
	}, []);

	const handleTaskClick = (task: TaskWithStatus) => {
		navigate({
			to: "/tasks/$taskId",
			params: { taskId: task.id },
			search: buildSearch({}),
		});
	};

	const showLinearCTA =
		integrations !== undefined && !isLinearConnected && typeTab === "tasks";

	const showTasks = typeTab === "tasks";
	const showIssues = typeTab === "issues";
	const taskSource: TaskSource = showIssues ? "issues" : "tasks";

	return (
		<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
			<TasksTopBar
				currentTab={currentTab}
				onTabChange={handleTabChange}
				searchQuery={searchQuery}
				onSearchChange={handleSearchChange}
				assigneeFilter={assigneeFilter}
				onAssigneeFilterChange={handleAssigneeFilterChange}
				selectedTasks={selectedTasks}
				onClearSelection={handleClearSelection}
				selectedIssues={selectedIssues}
				onClearIssueSelection={handleClearIssueSelection}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				taskSource={taskSource}
				onTaskSourceChange={handleTaskSourceChange}
				projectFilters={projectFilters}
				onProjectFiltersChange={handleProjectFiltersChange}
				linearProjectFilter={linearProjectFilter}
				onLinearProjectFilterChange={handleLinearProjectFilterChange}
				includeClosedIssues={includeClosedIssues}
				onIncludeClosedIssuesChange={handleIncludeClosedIssuesChange}
			/>

			{showLinearCTA ? (
				<LinearCTA />
			) : (
				<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
					{showTasks &&
						(viewMode === "board" ? (
							<BoardContent
								filterTab={currentTab}
								searchQuery={deferredSearchQuery}
								assigneeFilter={assigneeFilter}
								linearProjectFilter={linearProjectFilter}
								onTaskClick={handleTaskClick}
							/>
						) : (
							<TableContent
								filterTab={currentTab}
								searchQuery={deferredSearchQuery}
								assigneeFilter={assigneeFilter}
								linearProjectFilter={linearProjectFilter}
								onTaskClick={handleTaskClick}
								onSelectionChange={handleSelectionChange}
							/>
						))}
					{showIssues && (
						<GitHubIssuesContent
							projectFilters={projectFilters}
							projectTargets={projectTargets}
							areProjectsReady={areProjectsReady}
							hasProjects={v2Projects.length > 0}
							searchQuery={searchQuery}
							includeClosed={includeClosedIssues}
							onSelectionChange={handleIssueSelectionChange}
						/>
					)}
				</div>
			)}
		</div>
	);
}
