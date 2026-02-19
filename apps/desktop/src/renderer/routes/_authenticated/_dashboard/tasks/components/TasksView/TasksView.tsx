import { Spinner } from "@superset/ui/spinner";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { LinearCTA } from "./components/LinearCTA";
import { TasksTableView } from "./components/TasksTableView";
import { type TabValue, TasksTopBar } from "./components/TasksTopBar";
import { type TaskWithStatus, useTasksTable } from "./hooks/useTasksTable";

interface TasksViewProps {
	initialTab?: "all" | "active" | "backlog";
}

export function TasksView({ initialTab }: TasksViewProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const currentTab: TabValue = initialTab ?? "all";
	const [searchQuery, setSearchQuery] = useState("");
	const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);

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

	const { table, isLoading, slugColumnWidth, rowSelection, setRowSelection } =
		useTasksTable({
			filterTab: currentTab,
			searchQuery,
			assigneeFilter,
		});

	const selectedTasks = useMemo(() => {
		if (!Object.values(rowSelection).some(Boolean)) return [];

		return table
			.getRowModel()
			.rows.filter((row) => row.getIsSelected() && !row.getIsGrouped())
			.map((row) => row.original);
	}, [rowSelection, table]);

	const handleTabChange = (tab: TabValue) => {
		navigate({
			to: "/tasks",
			search: tab === "all" ? {} : { tab },
			replace: true,
		});
	};

	const handleTaskClick = (task: TaskWithStatus) => {
		navigate({
			to: "/tasks/$taskId",
			params: { taskId: task.id },
			search: currentTab === "all" ? {} : { tab: currentTab },
		});
	};

	const handleClearSelection = () => {
		setRowSelection({});
	};

	const showLoading = isLoading || isCheckingLinear;
	const showLinearCTA = !showLoading && !isLinearConnected;
	const showEmptyState =
		!showLoading && isLinearConnected && table.getRowModel().rows.length === 0;
	const showTable =
		!showLoading && isLinearConnected && table.getRowModel().rows.length > 0;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			{!showLinearCTA && (
				<TasksTopBar
					currentTab={currentTab}
					onTabChange={handleTabChange}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					assigneeFilter={assigneeFilter}
					onAssigneeFilterChange={setAssigneeFilter}
					selectedCount={selectedTasks.length}
					onClearSelection={handleClearSelection}
				/>
			)}

			{showLoading ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			) : showLinearCTA ? (
				<LinearCTA />
			) : showEmptyState ? (
				<div className="flex-1 flex items-center justify-center">
					<div className="flex flex-col items-center gap-2 text-muted-foreground">
						<HiCheckCircle className="h-8 w-8" />
						<span className="text-sm">No tasks found</span>
					</div>
				</div>
			) : showTable ? (
				<TasksTableView
					table={table}
					slugColumnWidth={slugColumnWidth}
					onTaskClick={handleTaskClick}
				/>
			) : null}
		</div>
	);
}
