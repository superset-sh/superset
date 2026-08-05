import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
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
	initialTab?: "all" | "active" | "backlog";
	initialAssignee?: string;
	initialSearch?: string;
	initialType?: "tasks" | "issues";
	initialProject?: string;
	initialLinearProject?: string;
	initialState?: "open" | "all";
}

export function TasksView({
	initialTab,
	initialAssignee,
	initialSearch,
	initialType,
	initialProject,
	initialLinearProject,
	initialState,
}: TasksViewProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const currentTab: TabValue = initialTab ?? "all";
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const assigneeFilter = initialAssignee ?? null;
	const typeTab = initialType ?? "tasks";
	const projectFilter = initialProject ?? null;
	const linearProjectFilter = initialLinearProject ?? null;

	const {
		setTab: storeSetTab,
		setAssignee: storeSetAssignee,
		setSearch: storeSetSearch,
		setTypeTab: storeSetTypeTab,
		setProjectFilter: storeSetProjectFilter,
		setLinearProjectFilter: storeSetLinearProjectFilter,
		includeClosedIssues: storedIncludeClosedIssues,
		setIncludeClosedIssues: storeSetIncludeClosedIssues,
		viewMode,
		setViewMode,
	} = useTasksFilterStore();
	const includeClosedIssues =
		initialState === undefined
			? storedIncludeClosedIssues
			: initialState === "all";

	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		setSearchQuery(initialSearch ?? "");
	}, [initialSearch]);

	const buildSearch = useCallback(
		(overrides: {
			tab?: TabValue;
			assignee?: string | null;
			search?: string;
			type?: "tasks" | "issues";
			project?: string | null;
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
				projectFilter:
					overrides.project !== undefined ? overrides.project : projectFilter,
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
			projectFilter,
			linearProjectFilter,
			includeClosedIssues,
		],
	);

	const syncSearchToUrl = useCallback(
		(query: string) => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				navigate({
					to: "/tasks",
					search: buildSearch({ search: query }),
					replace: true,
				});
			}, 300);
		},
		[navigate, buildSearch],
	);

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

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
		storeSetProjectFilter(projectFilter);
	}, [projectFilter, storeSetProjectFilter]);

	useEffect(() => {
		storeSetLinearProjectFilter(linearProjectFilter);
	}, [linearProjectFilter, storeSetLinearProjectFilter]);

	useEffect(() => {
		storeSetIncludeClosedIssues(includeClosedIssues);
	}, [includeClosedIssues, storeSetIncludeClosedIssues]);

	const { data: integrations } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.select(({ integrationConnections }) => ({
					...integrationConnections,
				})),
		[collections],
	);

	// Projects are fully local — identity comes from the host fan-out.
	const {
		hostId: projectHostId,
		isReady: areProjectsReady,
		project: selectedProject,
		projects: hostProjects,
	} = useProjectHost(projectFilter);
	const v2Projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);

	useEffect(() => {
		if (projectFilter && v2Projects.some((p) => p.id === projectFilter)) return;
		// A partial fan-out must not rewrite the user's filter: the selected
		// project may live on a host that hasn't answered yet.
		if (!areProjectsReady) return;
		const firstProject = v2Projects[0];
		if (!firstProject) return;
		navigate({
			to: "/tasks",
			search: buildSearch({ project: firstProject.id }),
			replace: true,
		});
	}, [areProjectsReady, projectFilter, v2Projects, navigate, buildSearch]);

	const isLinearConnected =
		integrations?.some((i) => i.provider === "linear") ?? false;

	const handleTabChange = (tab: TabValue) => {
		navigate({ to: "/tasks", search: buildSearch({ tab }), replace: true });
	};

	const handleAssigneeFilterChange = (assignee: string | null) => {
		navigate({
			to: "/tasks",
			search: buildSearch({ assignee }),
			replace: true,
		});
	};

	const navigateToType = (type: TaskSource, resetSearch: boolean) => {
		const nextSearch = resetSearch ? "" : searchQuery;
		if (resetSearch) {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
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

	const handleProjectFilterChange = (project: string) => {
		navigate({ to: "/tasks", search: buildSearch({ project }), replace: true });
	};

	const handleLinearProjectFilterChange = (linearProject: string | null) => {
		navigate({
			to: "/tasks",
			search: buildSearch({ linearProject }),
			replace: true,
		});
	};

	const handleIncludeClosedIssuesChange = (nextIncludeClosed: boolean) => {
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
				projectFilter={projectFilter}
				onProjectFilterChange={handleProjectFilterChange}
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
							projectFilter={selectedProject?.projectKey ?? null}
							hostId={projectHostId}
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
