import { Spinner } from "@superset/ui/spinner";
import { useCallback, useEffect, useMemo } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { useTasksTable } from "../../hooks/useTasksTable";
import { TasksTableView } from "../TasksTableView";
import type { TabValue } from "../TasksTopBar";

interface TableContentProps {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	onTaskClick: (task: TaskWithStatus) => void;
	onSelectionChange?: (
		selectedTasks: TaskWithStatus[],
		clearSelection: () => void,
	) => void;
}

export function TableContent({
	filterTab,
	searchQuery,
	assigneeFilter,
	onTaskClick,
	onSelectionChange,
}: TableContentProps) {
	const { table, isLoading, slugColumnWidth, rowSelection, setRowSelection } =
		useTasksTable({
			filterTab,
			searchQuery,
			assigneeFilter,
		});

	const selectedTasks = useMemo(() => {
		const selectedIds = Object.keys(rowSelection).filter(
			(id) => rowSelection[id],
		);
		if (selectedIds.length === 0) return [];
		return table
			.getRowModel()
			.flatRows.filter((row) => selectedIds.includes(row.id))
			.map((row) => row.original);
	}, [rowSelection, table]);

	const clearSelection = useCallback(() => {
		setRowSelection({});
	}, [setRowSelection]);

	useEffect(() => {
		onSelectionChange?.(selectedTasks, clearSelection);
	}, [selectedTasks, clearSelection, onSelectionChange]);

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (table.getRowModel().rows.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<HiCheckCircle className="h-8 w-8" />
					<span className="text-sm">No tasks found</span>
				</div>
			</div>
		);
	}

	return (
		<TasksTableView
			table={table}
			slugColumnWidth={slugColumnWidth}
			onTaskClick={onTaskClick}
		/>
	);
}
