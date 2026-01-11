import { ScrollArea } from "@superset/ui/scroll-area";
import { HiCheckCircle } from "react-icons/hi2";
import { TasksTableView } from "./components/TasksTableView";
import { useTasksTable } from "./hooks/useTasksTable";

export function TasksView() {
	const { table, isLoading, slugColumnWidth } = useTasksTable();

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	if (table.getRowModel().rows.length === 0) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<HiCheckCircle className="h-8 w-8" />
					<span className="text-sm">No tasks found</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<ScrollArea className="flex-1 min-h-0">
				<TasksTableView table={table} slugColumnWidth={slugColumnWidth} />
			</ScrollArea>
		</div>
	);
}
