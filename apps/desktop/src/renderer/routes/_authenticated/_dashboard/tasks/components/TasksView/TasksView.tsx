import { Spinner } from "@superset/ui/spinner";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTasksFilterStore } from "../../stores/tasks-filter-state";
import { BoardContent } from "./components/BoardContent";
import { LinearCTA } from "./components/LinearCTA";
import { TableContent } from "./components/TableContent";
import { type TabValue, TasksTopBar } from "./components/TasksTopBar";
import type { TaskWithStatus } from "./hooks/useTasksData";

interface TasksViewProps {
	initialTab?: "all" | "active" | "backlog";
	initialAssignee?: string;
	initialSearch?: string;
}

export function TasksView({
	initialTab,
	initialAssignee,
	initialSearch,
}: TasksViewProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const currentTab: TabValue = initialTab ?? "all";
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
	const assigneeFilter = initialAssignee ?? null;

	const {
		setTab: storeSetTab,
		setAssignee: storeSetAssignee,
		setSearch: storeSetSearch,
		viewMode,
		setViewMode,
	} = useTasksFilterStore();

	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

	const syncSearchToUrl = useCallback(
		(query: string) => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				const search: Record<string, string> = {};
				if (currentTab !== "all") search.tab = currentTab;
				if (assigneeFilter) search.assignee = assigneeFilter;
				if (query) search.search = query;
				navigate({ to: "/tasks", search, replace: true });
			}, 300);
		},
		[navigate, currentTab, assigneeFilter],
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

	const { data: integrations, isLoading: isCheckingLinear } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.select(({ integrationConnections }) => ({
					...integrationConnections,
				})),
		[collections],
	);

	const isLinearConnected =
		integrations?.some((i) => i.provider === "linear") ?? false;

	const handleTabChange = (tab: TabValue) => {
		const search: Record<string, string> = {};
		if (tab !== "all") search.tab = tab;
		if (assigneeFilter) search.assignee = assigneeFilter;
		if (searchQuery) search.search = searchQuery;
		navigate({ to: "/tasks", search, replace: true });
	};

	const handleAssigneeFilterChange = (assignee: string | null) => {
		const search: Record<string, string> = {};
		if (currentTab !== "all") search.tab = currentTab;
		if (assignee) search.assignee = assignee;
		if (searchQuery) search.search = searchQuery;
		navigate({ to: "/tasks", search, replace: true });
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

	const handleTaskClick = (task: TaskWithStatus) => {
		const search: Record<string, string> = {};
		if (currentTab !== "all") search.tab = currentTab;
		if (assigneeFilter) search.assignee = assigneeFilter;
		if (searchQuery) search.search = searchQuery;
		navigate({
			to: "/tasks/$taskId",
			params: { taskId: task.id },
			search,
		});
	};

	const showLinearCTA = !isCheckingLinear && !isLinearConnected;

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
					viewMode={viewMode}
					onViewModeChange={setViewMode}
				/>
			)}

			{isCheckingLinear ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			) : showLinearCTA ? (
				<LinearCTA />
			) : viewMode === "board" ? (
				<BoardContent
					filterTab={currentTab}
					searchQuery={searchQuery}
					assigneeFilter={assigneeFilter}
					onTaskClick={handleTaskClick}
				/>
			) : (
				<TableContent
					filterTab={currentTab}
					searchQuery={searchQuery}
					assigneeFilter={assigneeFilter}
					onTaskClick={handleTaskClick}
					onSelectionChange={handleSelectionChange}
				/>
			)}
		</div>
	);
}
