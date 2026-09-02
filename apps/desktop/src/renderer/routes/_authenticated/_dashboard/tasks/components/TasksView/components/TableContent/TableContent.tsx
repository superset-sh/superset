import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import { useAutoLoadEmptyPages } from "../../hooks/useAutoLoadEmptyPages";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { useTasksTable } from "../../hooks/useTasksTable";
import { TasksTableView } from "../TasksTableView";
import type { TabValue } from "../TasksTopBar";
import { getSelectedTasks } from "./utils/getSelectedTasks";

interface TableContentProps {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	linearProjectFilter: string | null;
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
	linearProjectFilter,
	onTaskClick,
	onSelectionChange,
}: TableContentProps) {
	const {
		table,
		slugColumnWidth,
		rowSelection,
		setRowSelection,
		fetchNextTasksPage,
		hasNextTasksPage,
		isFetchingNextTasksPage,
		isLoadingTasks,
	} = useTasksTable({
		filterTab,
		searchQuery,
		assigneeFilter,
		linearProjectFilter,
	});

	const rows = table.getRowModel().rows;

	useAutoLoadEmptyPages({
		isEmpty: rows.length === 0,
		isLoading: isLoadingTasks,
		filterKey: `${filterTab}\0${searchQuery}\0${assigneeFilter ?? ""}\0${linearProjectFilter ?? ""}`,
		hasNextPage: hasNextTasksPage,
		isFetchingNextPage: isFetchingNextTasksPage,
		onLoadMore: fetchNextTasksPage,
	});

	const selectedTasks = useMemo(() => {
		return getSelectedTasks(table.getRowModel().flatRows, rowSelection);
	}, [rowSelection, table]);

	const clearSelection = useCallback(() => {
		setRowSelection({});
	}, [setRowSelection]);

	useEffect(() => {
		onSelectionChange?.(selectedTasks, clearSelection);
	}, [selectedTasks, clearSelection, onSelectionChange]);

	if (rows.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<HiCheckCircle className="h-8 w-8" />
					<span className="text-sm">
						<Trans id="dashboard.tasks.tableContent.empty">
							No tasks found
						</Trans>
					</span>
				</div>
			</div>
		);
	}

	return (
		<TasksTableView
			table={table}
			slugColumnWidth={slugColumnWidth}
			onTaskClick={onTaskClick}
			hasNextPage={hasNextTasksPage}
			isFetchingNextPage={isFetchingNextTasksPage}
			onLoadMore={fetchNextTasksPage}
		/>
	);
}
