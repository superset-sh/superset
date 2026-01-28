import { ScrollArea } from "@superset/ui/scroll-area";
import { Spinner } from "@superset/ui/spinner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { LinearCTA } from "./components/LinearCTA";
import { TasksTableView } from "./components/TasksTableView";
import { type TabValue, TasksTopBar } from "./components/TasksTopBar";
import { type TaskWithStatus, useTasksTable } from "./hooks/useTasksTable";

export function TasksView() {
	const navigate = useNavigate();
	const collections = useCollections();
	const [currentTab, setCurrentTab] = useState<TabValue>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);

	const { data: integrations, isLoading: isCheckingLinear } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.where(({ integrationConnections }) =>
					eq(integrationConnections.provider, "linear"),
				)
				.select(({ integrationConnections }) => integrationConnections),
		[collections],
	);

	const isLinearConnected = integrations && integrations.length > 0;

	const { table, isLoading, slugColumnWidth } = useTasksTable({
		filterTab: currentTab,
		searchQuery,
		assigneeFilter,
	});

	const handleTaskClick = (task: TaskWithStatus) => {
		navigate({
			to: "/tasks/$taskId",
			params: { taskId: task.id },
		});
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
					onTabChange={setCurrentTab}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					assigneeFilter={assigneeFilter}
					onAssigneeFilterChange={setAssigneeFilter}
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
				<ScrollArea className="flex-1 min-h-0">
					<TasksTableView
						table={table}
						slugColumnWidth={slugColumnWidth}
						onTaskClick={handleTaskClick}
					/>
				</ScrollArea>
			) : null}
		</div>
	);
}
