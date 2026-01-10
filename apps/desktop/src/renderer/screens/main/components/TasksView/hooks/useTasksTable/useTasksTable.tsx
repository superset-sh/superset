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
import type { SelectTask } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { format } from "date-fns";
import { Button } from "@superset/ui/button";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { StatusIcon, STATUS_COLORS } from "../../components/StatusIcon";
import { StatusCell } from "../../components/cells/StatusCell";
import { PriorityCell } from "../../components/cells/PriorityCell";
import { AssigneeCell } from "../../components/cells/AssigneeCell";
import { LabelsCell } from "../../components/cells/LabelsCell";

const columnHelper = createColumnHelper<SelectTask>();

export function useTasksTable(): {
	table: Table<SelectTask>;
	isLoading: boolean;
} {
	const collections = useCollections();
	const [grouping, setGrouping] = useState<string[]>(["status"]);
	const [expanded, setExpanded] = useState<ExpandedState>(true);

	const { data: allTasks, isLoading } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	const data = useMemo(
		() => allTasks?.filter((task) => task.deletedAt === null) || [],
		[allTasks],
	);

	// TODO: Add localStorage persistence for collapsed groups

	// Define columns with useMemo (following official docs pattern)
	const columns = useMemo<ColumnDef<SelectTask>[]>(
		() => [
			// Status column (grouped) - only shows for group headers
			columnHelper.accessor("status", {
				header: "Status",
				cell: (info) => {
					const { row, cell } = info;

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
										type={info.getValue() as any}
										color={STATUS_COLORS[info.getValue()] || "#8B5CF6"}
									/>
									<span className="text-sm font-medium capitalize">
										{info.getValue().replace("-", " ")}
									</span>
									<span className="text-xs text-muted-foreground">
										({row.subRows.length})
									</span>
								</div>
							</Button>
						);
					}

					// For leaf rows, return null - status icon is shown in title column
					return null;
				},
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
					const task = info.row.original;
					return (
						<div className="flex items-center gap-2 flex-1 min-w-0">
							<StatusCell info={{ ...info, getValue: () => task.status } as any} />
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
