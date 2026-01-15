import { ScrollArea } from "@superset/ui/scroll-area";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import { TasksTableView } from "./components/TasksTableView";
import { type TabValue, TasksTopBar } from "./components/TasksTopBar";
import { useTasksTable } from "./hooks/useTasksTable";

export function TasksView() {
	const [currentTab, setCurrentTab] = useState<TabValue>("all");
	const [searchQuery, setSearchQuery] = useState("");

	const { table, isLoading, slugColumnWidth } = useTasksTable({
		filterTab: currentTab,
		searchQuery,
	});

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<TasksTopBar
				currentTab={currentTab}
				onTabChange={setCurrentTab}
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
			/>

			{isLoading ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			) : table.getRowModel().rows.length === 0 ? (
				<div className="flex-1 flex items-center justify-center">
					<div className="flex flex-col items-center gap-2 text-muted-foreground">
						<HiCheckCircle className="h-8 w-8" />
						<span className="text-sm">No tasks found</span>
					</div>
				</div>
			) : (
				<ScrollArea className="flex-1 min-h-0">
					<TasksTableView table={table} slugColumnWidth={slugColumnWidth} />
				</ScrollArea>
			)}
		</div>
	);
}
