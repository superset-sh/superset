import type {
	SelectTask,
	SelectTaskStatus,
	SelectUser,
} from "@superset/db/schema";
import { Badge } from "@superset/ui/badge";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	type ColumnFiltersState,
	createColumnHelper,
	type ExpandedState,
	getCoreRowModel,
	getExpandedRowModel,
	getFilteredRowModel,
	getGroupedRowModel,
	type Table,
	useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	StatusIcon,
	type StatusType,
} from "../../components/shared/StatusIcon";
import type { TabValue } from "../../components/TasksTopBar";
import { compareTasks } from "../../utils/sorting";
import { useHybridSearch } from "../useHybridSearch";
import { AssigneeCell } from "./components/AssigneeCell";
import { PriorityCell } from "./components/PriorityCell";
import { StatusCell } from "./components/StatusCell";

export type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: SelectUser | null;
};

const columnHelper = createColumnHelper<TaskWithStatus>();

interface UseTasksTableParams {
	filterTab: TabValue;
	searchQuery: string;
}

export function useTasksTable({
	filterTab,
	searchQuery,
}: UseTasksTableParams): {
	table: Table<TaskWithStatus>;
	isLoading: boolean;
	slugColumnWidth: string;
} {
	const collections = useCollections();
	const [grouping, setGrouping] = useState<string[]>(["status"]);
	const [expanded, setExpanded] = useState<ExpandedState>(true);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

	const { data: allData, isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.leftJoin({ assignee: collections.users }, ({ tasks, assignee }) =>
					eq(tasks.assigneeId, assignee.id),
				)
				.select(({ tasks, status, assignee }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const sortedData = useMemo(() => {
		if (!allData) return [];
		return [...allData].sort(compareTasks);
	}, [allData]);

	const { search } = useHybridSearch<TaskWithStatus>(sortedData);

	const data = useMemo(() => {
		if (!searchQuery.trim()) {
			return sortedData;
		}
		const results = search(searchQuery);
		return results.map((r) => r.item);
	}, [sortedData, searchQuery, search]);

	useEffect(() => {
		const newColumnFilters: ColumnFiltersState = [];
		if (filterTab !== "all") {
			newColumnFilters.push({
				id: "status",
				value: filterTab,
			});
		}
		setColumnFilters(newColumnFilters);
	}, [filterTab]);

	const slugColumnWidth = useMemo(() => {
		if (!data || data.length === 0) return "5rem";

		const longestSlug = data.reduce((longest, task) => {
			return task.slug.length > longest.length ? task.slug : longest;
		}, "");

		const REM_PER_CHAR = 0.5 * 0.75;
		const PADDING_REM = 0.5;
		const width = longestSlug.length * REM_PER_CHAR + PADDING_REM;

		return `${Math.ceil(width * 10) / 10}rem`;
	}, [data]);

	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row.status, {
				id: "status",
				header: "Status",
				filterFn: (row, _columnId, filterValue: TabValue) => {
					const statusType = row.original.status.type;
					if (filterValue === "active") {
						return statusType === "started" || statusType === "unstarted";
					}
					if (filterValue === "backlog") {
						return statusType === "backlog";
					}
					return true;
				},
				cell: (info) => {
					const { row, cell } = info;
					const status = info.getValue();

					if (cell.getIsGrouped()) {
						return (
							<div
								className="w-full"
								style={{
									background: `linear-gradient(90deg, ${status.color}14 0%, transparent 100%)`,
								}}
							>
								<button
									type="button"
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
											type={status.type as StatusType}
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

					return null;
				},
				getGroupingValue: (row) => row.status.name,
			}),

			columnHelper.display({
				id: "checkbox",
				header: "",
				cell: () => {
					return <div className="w-4" />;
				},
			}),

			columnHelper.accessor("priority", {
				header: "Priority",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return <PriorityCell info={info} />;
				},
			}),

			columnHelper.accessor("slug", {
				header: "ID",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return (
						<span className="text-xs text-muted-foreground shrink-0">
							{info.getValue()}
						</span>
					);
				},
			}),

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
								<span className="text-sm font-medium line-clamp-1 shrink">
									{info.getValue()}
								</span>
								{labels.length > 0 && (
									<div className="flex gap-1 shrink-0">
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

			columnHelper.accessor("assigneeId", {
				header: "Assignee",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return <AssigneeCell info={info} />;
				},
			}),

			columnHelper.accessor("createdAt", {
				header: "Created",
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					const date = info.getValue();
					if (!date) return null;
					return (
						<span className="text-xs text-muted-foreground shrink-0 w-11">
							{format(new Date(date), "MMM d")}
						</span>
					);
				},
			}),
		],
		[],
	);

	const table = useReactTable({
		data,
		columns,
		state: {
			grouping,
			expanded,
			columnFilters,
		},
		onGroupingChange: setGrouping,
		onExpandedChange: setExpanded,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getGroupedRowModel: getGroupedRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		autoResetExpanded: false,
	});

	return { table, isLoading, slugColumnWidth };
}
