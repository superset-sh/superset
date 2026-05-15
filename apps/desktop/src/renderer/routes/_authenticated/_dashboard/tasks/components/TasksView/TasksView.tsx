import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useRef,
	useState,
} from "react";
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
import { PullRequestsContent } from "./components/PullRequestsContent";
import { TableContent } from "./components/TableContent";
import { type TabValue, TasksTopBar } from "./components/TasksTopBar";
import type { TaskWithStatus } from "./hooks/useTasksData";

interface TasksViewProps {
	initialTab?: "all" | "active" | "backlog";
	initialAssignee?: string;
	initialSearch?: string;
	initialType?: "tasks" | "prs" | "issues";
	initialProject?: string;
}

export function TasksView({
	initialTab,
	initialAssignee,
	initialSearch,
	initialType,
	initialProject,
}: TasksViewProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const currentTab: TabValue = initialTab ?? "all";
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const assigneeFilter = initialAssignee ?? null;
	const typeTab = initialType ?? "tasks";
	const projectFilter = initialProject ?? null;

	const {
		setTab: storeSetTab,
		setAssignee: storeSetAssignee,
		setSearch: storeSetSearch,
		setTypeTab: storeSetTypeTab,
		setProjectFilter: storeSetProjectFilter,
		viewMode,
		setViewMode,
	} = useTasksFilterStore();

	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

	const buildSearch = useCallback(
		(overrides: {
			tab?: TabValue;
			assignee?: string | null;
			search?: string;
			type?: "tasks" | "prs" | "issues";
			project?: string | null;
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
			}),
		[currentTab, assigneeFilter, searchQuery, typeTab, projectFilter],
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

	const { data: integrations } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.select(({ integrationConnections }) => ({
					...integrationConnections,
				})),
		[collections],
	);

	const { data: v2Projects } = useLiveQuery(
		(q) => q.from({ projects: collections.v2Projects }),
		[collections],
	);

	useEffect(() => {
		if (!v2Projects) return;
		if (projectFilter && v2Projects.some((p) => p.id === projectFilter)) return;
		const firstProject = v2Projects[0];
		if (!firstProject) return;
		navigate({
			to: "/tasks",
			search: buildSearch({ project: firstProject.id }),
			replace: true,
		});
	}, [projectFilter, v2Projects, navigate, buildSearch]);

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

	const handleTypeTabChange = (type: "tasks" | "prs" | "issues") => {
		navigate({ to: "/tasks", search: buildSearch({ type }), replace: true });
	};

	const handleProjectFilterChange = (project: string) => {
		navigate({ to: "/tasks", search: buildSearch({ project }), replace: true });
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
	const showPRs = typeTab === "prs";
	const showIssues = typeTab === "issues";

	return (
		<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
			{!showLinearCTA && (
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
					typeTab={typeTab}
					onTypeTabChange={handleTypeTabChange}
					projectFilter={projectFilter}
					onProjectFilterChange={handleProjectFilterChange}
				/>
			)}

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
					{showPRs && (
						<PullRequestsContent
							projectFilter={projectFilter}
							searchQuery={deferredSearchQuery}
						/>
					)}
					{showIssues && (
						<GitHubIssuesContent
							projectFilter={projectFilter}
							searchQuery={deferredSearchQuery}
							onSelectionChange={handleIssueSelectionChange}
						/>
					)}
				</div>
			)}
		</div>
	);
}
