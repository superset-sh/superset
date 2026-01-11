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
import { HiChevronRight } from "react-icons/hi2";
import { Badge } from "@superset/ui/badge";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { StatusIcon } from "../../components/StatusIcon";
import { StatusCell } from "../../components/cells/StatusCell";
import { PriorityCell } from "../../components/cells/PriorityCell";
import { AssigneeCell } from "../../components/cells/AssigneeCell";

// Task with joined status data
type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
};

// Status type ordering (Linear style: in progress → todo → backlog → done → cancelled)
const STATUS_TYPE_ORDER: Record<string, number> = {
	started: 0,
	unstarted: 1,
	backlog: 2,
	completed: 3,
	cancelled: 4,
};

const columnHelper = createColumnHelper<TaskWithStatus>();

export function useTasksTable(): {
	table: Table<TaskWithStatus>;
	isLoading: boolean;
	slugColumnWidth: string;
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

	// Client-side join: merge tasks with their status and sort
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
			})
			.sort((a, b) => {
				// Sort by status type first (started → unstarted → backlog → completed → cancelled)
				const typeOrderA = STATUS_TYPE_ORDER[a.status.type] ?? 999;
				const typeOrderB = STATUS_TYPE_ORDER[b.status.type] ?? 999;
				if (typeOrderA !== typeOrderB) {
					return typeOrderA - typeOrderB;
				}
				// Within same type, sort by position
				return a.status.position - b.status.position;
			});
	}, [allTasks, allStatuses]);

	// Calculate optimal slug column width based on longest slug
	const slugColumnWidth = useMemo(() => {
		if (!data || data.length === 0) return "5rem"; // Default fallback

		const longestSlug = data.reduce((longest, task) => {
			return task.slug.length > longest.length ? task.slug : longest;
		}, "");

		// Monospace font-mono at text-xs (0.75rem = 12px)
		// Each character is ~0.5em of the font size = 0.5 * 0.75rem = 0.375rem per char
		const remPerChar = 0.5 * 0.75; // 0.375rem per character
		const padding = 0.5; // rem for horizontal padding
		const width = longestSlug.length * remPerChar + padding;

		return `${Math.ceil(width * 10) / 10}rem`; // Round to 1 decimal
	}, [data]);

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
						// Group header row with subtle gradient (Linear style, 8% opacity)
						return (
							<div
								className="w-full"
								style={{
									background: `linear-gradient(90deg, ${status.color}14 0%, transparent 100%)`,
								}}
							>
								<button
									className="group w-full justify-start px-4 py-2 h-auto relative rounded-none bg-transparent flex items-center cursor-pointer border-0"
									onClick={row.getToggleExpandedHandler()}
								>
									<HiChevronRight
										className={`h-3 w-3 text-muted-foreground transition-transform duration-100 group-hover:text-foreground ${
											row.getIsExpanded() ? "rotate-90" : ""
										}`}
									/>
									<div className="flex items-center gap-2 pl-4">
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
								</button>
							</div>
						);
					}

					// For leaf rows, return null - status icon is shown in title column
					return null;
				},
				getGroupingValue: (row) => row.status.name,
			}),

			// Checkbox column (placeholder for future selection)
			columnHelper.display({
				id: "checkbox",
				header: "",
				cell: () => {
					return <div className="w-4" />;
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

			// Task ID - simple inline rendering
			columnHelper.accessor("slug", {
				header: "ID",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return (
						<span className="text-xs text-muted-foreground flex-shrink-0">
							{info.getValue()}
						</span>
					);
				},
			}),

			// Title + Labels - combined to handle overflow better
			columnHelper.accessor("title", {
				header: "Title",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					const taskWithStatus = info.row.original;
					const labels = taskWithStatus.labels || [];
					return (
						<div className="flex items-center gap-1.5 flex-1 min-w-0">
							<StatusCell taskWithStatus={taskWithStatus} />
							<div className="flex items-center justify-between gap-2 flex-1 min-w-0">
								<span className="text-sm font-medium line-clamp-1 flex-shrink">
									{info.getValue()}
								</span>
								{labels.length > 0 && (
									<div className="flex gap-1 flex-shrink-0">
										{labels.slice(0, 2).map((label) => (
											<Badge key={label} variant="outline" className="text-xs">
												{label}
											</Badge>
										))}
										{labels.length > 2 && (
											<Badge variant="outline" className="text-xs">
												+{labels.length - 2}
											</Badge>
										)}
									</div>
								)}
							</div>
						</div>
					);
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

			// Created date - simple inline rendering
			columnHelper.accessor("createdAt", {
				header: "Created",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					const date = info.getValue();
					if (!date) return null;
					return (
						<span className="text-xs text-muted-foreground flex-shrink-0 w-11">
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

	return { table, isLoading, slugColumnWidth };
}
