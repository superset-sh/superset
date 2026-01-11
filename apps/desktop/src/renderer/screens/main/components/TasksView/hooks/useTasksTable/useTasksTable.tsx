import { useMemo, useState } from "react";
import {
	type ColumnDef,
	type ExpandedState,
	type Table,
	createColumnHelper,
	getCoreRowModel,
	getExpandedRowModel,
	getGroupedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { format } from "date-fns";
import { Button } from "@superset/ui/button";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { StatusIcon } from "../../components/StatusIcon";
import { StatusCell } from "../../components/cells/StatusCell";
import { PriorityCell } from "../../components/cells/PriorityCell";
import { AssigneeCell } from "../../components/cells/AssigneeCell";
import { LabelsCell } from "../../components/cells/LabelsCell";

// Task with joined status data
type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
};

const columnHelper = createColumnHelper<TaskWithStatus>();

export function useTasksTable(): {
	table: Table<TaskWithStatus>;
	isLoading: boolean;
} {
	const collections = useCollections();
	const [grouping, setGrouping] = useState<string[]>(["status"]);
	const [expanded, setExpanded] = useState<ExpandedState>(true);

	// Load tasks and statuses separately
	const { data: allTasks, isLoading: tasksLoading } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	const { data: allStatuses, isLoading: statusesLoading } = useLiveQuery(
		(q) => q.from({ taskStatuses: collections.taskStatuses }),
		[collections],
	);

	// Client-side join: merge tasks with their status
	const data = useMemo(() => {
		if (!allTasks || !allStatuses) return [];

		const statusMap = new Map(allStatuses.map((s) => [s.id, s]));

		return allTasks
			.filter((task) => task.deletedAt === null)
			.map((task) => {
				const status = statusMap.get(task.statusId);
				if (!status) {
					console.warn(`[useTasksTable] Status not found for task ${task.id}`);
					// Provide a fallback status to prevent crashes
					return {
						...task,
						status: {
							id: task.statusId,
							name: "Unknown",
							color: "#8B5CF6",
							type: "unstarted",
							position: 0,
							progressPercent: null,
						} as SelectTaskStatus,
					};
				}
				return { ...task, status };
			});
	}, [allTasks, allStatuses]);

	const isLoading = tasksLoading || statusesLoading;

	// TODO: Add localStorage persistence for collapsed groups

	// Define columns with useMemo (following official docs pattern)
	const columns = useMemo<ColumnDef<TaskWithStatus>[]>(
		() => [
			// Status column (grouped) - only shows for group headers
			columnHelper.accessor((row) => row.status, {
				id: "status",
				header: "Status",
				cell: (info) => {
					const { row, cell } = info;
					const status = info.getValue();

					if (cell.getIsGrouped()) {
						// Group header row
						return (
							<Button
								variant="ghost"
								className="w-full justify-start px-4 py-2 h-auto hover:bg-accent/50"
								onClick={row.getToggleExpandedHandler()}
							>
								<div className="flex items-center gap-2">
									{row.getIsExpanded() ? (
										<HiChevronDown className="h-4 w-4 text-muted-foreground" />
									) : (
										<HiChevronRight className="h-4 w-4 text-muted-foreground" />
									)}
									<StatusIcon
										type={status.type as any}
										color={status.color}
										progress={status.progressPercent ?? undefined}
									/>
									<span className="text-sm font-medium capitalize">
										{status.name}
									</span>
									<span className="text-xs text-muted-foreground">
										{row.subRows.length}
									</span>
								</div>
							</Button>
						);
					}

					// For leaf rows, return null - status icon is shown in title column
					return null;
				},
				getGroupingValue: (row) => row.status.name,
			}),

			// Task ID - simple inline rendering
			columnHelper.accessor("slug", {
				header: "ID",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return (
						<span className="text-xs text-muted-foreground font-mono w-20 flex-shrink-0">
							{info.getValue()}
						</span>
					);
				},
			}),

			// Title - status icon + title inline (Linear style)
			columnHelper.accessor("title", {
				header: "Title",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					const taskWithStatus = info.row.original;
					return (
						<div className="flex items-center gap-2 flex-1 min-w-0">
							<StatusCell taskWithStatus={taskWithStatus} />
							<span className="text-sm font-medium truncate">
								{info.getValue()}
							</span>
						</div>
					);
				},
			}),

			// Priority - clickable dropdown
			columnHelper.accessor("priority", {
				header: "Priority",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return <PriorityCell info={info} />;
				},
			}),

			// Assignee - clickable dropdown
			columnHelper.accessor("assigneeId", {
				header: "Assignee",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return <AssigneeCell info={info} />;
				},
			}),

			// Labels - multi-select dropdown
			columnHelper.accessor("labels", {
				header: "Labels",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return <LabelsCell info={info} />;
				},
			}),

			// Due date - simple inline rendering
			columnHelper.accessor("dueDate", {
				header: "Due",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					const date = info.getValue();
					if (!date) return null;
					return (
						<span className="text-xs text-muted-foreground flex-shrink-0">
							{format(new Date(date), "MMM d")}
						</span>
					);
				},
			}),
		],
		[],
	);

	// Create table instance
	const table = useReactTable({
		data,
		columns,
		state: { grouping, expanded },
		onGroupingChange: setGrouping,
		onExpandedChange: setExpanded,
		getCoreRowModel: getCoreRowModel(),
		getGroupedRowModel: getGroupedRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		autoResetExpanded: false,
	});

	return { table, isLoading };
}
