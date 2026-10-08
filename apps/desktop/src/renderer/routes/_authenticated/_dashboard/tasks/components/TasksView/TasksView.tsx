import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDebouncedSearchNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDebouncedSearchNavigation";
import { useProjectQueryTargets } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import {
	type TypeTab,
	tasksSearchFromFilters,
	useTasksFilterStore,
} from "../../stores/tasks-filter-state";
import type { LinearIssue } from "../../utils/linearIssueTypes";
import { BoardContent } from "./components/BoardContent";
import {
	GitHubIssuesContent,
	type SelectedIssue,
} from "./components/GitHubIssuesContent";
import { LinearIssuesContent } from "./components/LinearIssuesContent";
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
	initialType?: TypeTab;
	initialProjects?: string[];
	initialState?: "open" | "all";
}

export function TasksView({
	initialTab,
	initialAssignee,
	initialSearch,
	initialType,
	initialProjects,
	initialState,
}: TasksViewProps) {
	const navigate = useNavigate();
	const {
		tab: storedTab,
		assignee: storedAssignee,
		search: storedSearch,
		typeTab: storedTypeTab,
		projectFilters: storedProjectFilters,
		setTab: storeSetTab,
		setAssignee: storeSetAssignee,
		setSearch: storeSetSearch,
		setTypeTab: storeSetTypeTab,
		setProjectFilters: storeSetProjectFilters,
		linearTeamFilter,
		setLinearTeamFilter,
		linearAssigneeFilter,
		setLinearAssigneeFilter,
		includeClosedIssues: storedIncludeClosedIssues,
		setIncludeClosedIssues: storeSetIncludeClosedIssues,
		viewMode,
		setViewMode,
	} = useTasksFilterStore();
	const currentTab: TabValue = initialTab ?? storedTab;
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? storedSearch);
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const assigneeFilter = initialAssignee ?? storedAssignee;
	const typeTab: TypeTab = initialType ?? storedTypeTab;
	const projectFilters = initialProjects ?? storedProjectFilters;
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
			type?: TypeTab;
			projects?: string[];
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
				includeClosedIssues:
					overrides.includeClosedIssues ?? includeClosedIssues,
			}),
		[
			currentTab,
			assigneeFilter,
			searchQuery,
			typeTab,
			projectFilters,
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
		storeSetIncludeClosedIssues(includeClosedIssues);
	}, [includeClosedIssues, storeSetIncludeClosedIssues]);

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

	const handleLinearIssueOpen = (issue: LinearIssue) => {
		navigate({
			to: "/tasks/linear/$issueId",
			params: { issueId: issue.identifier },
			search: buildSearch({}),
		});
	};

	const showTasks = typeTab === "tasks";
	const showLinear = typeTab === "linear";
	const showIssues = typeTab === "issues";
	const taskSource: TaskSource = typeTab;

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
				linearTeamFilter={linearTeamFilter}
				onLinearTeamFilterChange={setLinearTeamFilter}
				linearAssigneeFilter={linearAssigneeFilter}
				onLinearAssigneeFilterChange={setLinearAssigneeFilter}
				includeClosedIssues={includeClosedIssues}
				onIncludeClosedIssuesChange={handleIncludeClosedIssuesChange}
			/>

			<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
				{showTasks &&
					(viewMode === "board" ? (
						<BoardContent
							filterTab={currentTab}
							searchQuery={deferredSearchQuery}
							assigneeFilter={assigneeFilter}
							onTaskClick={handleTaskClick}
						/>
					) : (
						<TableContent
							filterTab={currentTab}
							searchQuery={deferredSearchQuery}
							assigneeFilter={assigneeFilter}
							onTaskClick={handleTaskClick}
							onSelectionChange={handleSelectionChange}
						/>
					))}
				{showLinear && (
					<LinearIssuesContent
						filters={{
							teamId: linearTeamFilter,
							status: currentTab,
							assignee: linearAssigneeFilter,
							search: searchQuery,
						}}
						viewMode={viewMode}
						onOpen={handleLinearIssueOpen}
					/>
				)}
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
		</div>
	);
}
