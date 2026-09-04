import { useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Checkbox } from "@superset/ui/checkbox";
import {
	type ColumnFiltersState,
	createColumnHelper,
	type ExpandedState,
	getCoreRowModel,
	getExpandedRowModel,
	getFilteredRowModel,
	getGroupedRowModel,
	type RowSelectionState,
	type Table,
	useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { getSlugColumnWidth } from "renderer/lib/slug-width";
import { create } from "zustand";
import {
	StatusIcon,
	type StatusType,
} from "../../components/shared/StatusIcon";
import type { TabValue } from "../../components/TasksTopBar";
import { matchesTaskStatusFilter } from "../../utils/matchesTaskStatusFilter";
import { useHybridSearch } from "../useHybridSearch";
import {
	type TasksPagination,
	type TaskWithStatus,
	useTasksJoinedWithStatuses,
} from "../useTasksData";
import { AssigneeCell } from "./components/AssigneeCell";
import { PriorityCell } from "./components/PriorityCell";
import { StatusCell } from "./components/StatusCell";

export type { TaskWithStatus };

const columnHelper = createColumnHelper<TaskWithStatus>();

const useRowSelectionStore = create<{
	rowSelection: RowSelectionState;
	setRowSelection: (
		updater:
			| RowSelectionState
			| ((prev: RowSelectionState) => RowSelectionState),
	) => void;
}>((set) => ({
	rowSelection: {},
	setRowSelection: (updater) =>
		set((state) => ({
			rowSelection:
				typeof updater === "function" ? updater(state.rowSelection) : updater,
		})),
}));

interface UseTasksTableParams {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	linearProjectFilter: string | null;
}

export function useTasksTable({
	filterTab,
	searchQuery,
	assigneeFilter,
	linearProjectFilter,
}: UseTasksTableParams): TasksPagination & {
	table: Table<TaskWithStatus>;
	slugColumnWidth: string;
	rowSelection: RowSelectionState;
	setRowSelection: (
		updater:
			| RowSelectionState
			| ((prev: RowSelectionState) => RowSelectionState),
	) => void;
} {
	const { t } = useLingui();
	const [grouping, setGrouping] = useState<string[]>(["status"]);
	const [expanded, setExpanded] = useState<ExpandedState>(true);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const rowSelection = useRowSelectionStore((s) => s.rowSelection);
	const setRowSelection = useRowSelectionStore((s) => s.setRowSelection);

	const {
		tasks: sortedData,
		fetchNextTasksPage,
		hasNextTasksPage,
		isFetchingNextTasksPage,
		isLoadingTasks,
	} = useTasksJoinedWithStatuses();

	const projectScopedData = useMemo(() => {
		if (!linearProjectFilter) return sortedData;
		return sortedData.filter(
			(task) => task.externalProjectId === linearProjectFilter,
		);
	}, [sortedData, linearProjectFilter]);

	const { search } = useHybridSearch(projectScopedData);

	const data = useMemo(() => {
		if (!searchQuery.trim()) {
			return projectScopedData;
		}
		const results = search(searchQuery);
		return results.map((r) => r.item);
	}, [projectScopedData, searchQuery, search]);

	const isFirstMount = useRef(true);
	useEffect(() => {
		const newColumnFilters: ColumnFiltersState = [];
		if (filterTab !== "all") {
			newColumnFilters.push({
				id: "status",
				value: filterTab,
			});
		}
		if (assigneeFilter !== null) {
			newColumnFilters.push({
				id: "assigneeId",
				value: assigneeFilter,
			});
		}
		setColumnFilters(newColumnFilters);
		if (isFirstMount.current) {
			isFirstMount.current = false;
		} else {
			setRowSelection({});
		}
	}, [filterTab, assigneeFilter, setRowSelection]);

	const slugColumnWidth = useMemo(
		() => getSlugColumnWidth((data ?? []).map((t) => t.slug)),
		[data],
	);

	const columns = useMemo(
		() => [
			columnHelper.accessor((row) => row.status, {
				id: "status",
				header: t({
					message: "Status",
				}),
				filterFn: (row, _columnId, filterValue: TabValue) => {
					const statusType = row.original.status.type;
					return matchesTaskStatusFilter(statusType, filterValue);
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
				cell: ({ row }) => {
					if (row.getIsGrouped()) return null;
					return (
						<Checkbox
							checked={row.getIsSelected()}
							onCheckedChange={(checked) =>
								row.toggleSelected(Boolean(checked))
							}
							onClick={(e) => e.stopPropagation()}
							aria-label={t({
								message: "Select task",
							})}
							className="cursor-pointer"
						/>
					);
				},
			}),

			columnHelper.accessor("priority", {
				header: t({
					message: "Priority",
				}),
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return <PriorityCell info={info} />;
				},
			}),

			columnHelper.accessor("slug", {
				header: t({
					message: "ID",
				}),
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return (
						<span className="text-xs text-muted-foreground truncate min-w-0">
							{info.getValue()}
						</span>
					);
				},
			}),

			columnHelper.accessor("title", {
				header: t({
					message: "Title",
				}),
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
				header: t({
					message: "Assignee",
				}),
				filterFn: (row, _columnId, filterValue: string) => {
					if (filterValue === "unassigned") {
						return (
							row.original.assigneeId === null &&
							row.original.assigneeExternalId === null
						);
					}
					if (filterValue.startsWith("ext:")) {
						return row.original.assigneeExternalId === filterValue.slice(4);
					}
					return row.original.assigneeId === filterValue;
				},
				cell: (info) => {
					if (info.cell.getIsPlaceholder()) return null;
					return <AssigneeCell info={info} />;
				},
			}),

			columnHelper.accessor("createdAt", {
				header: t({
					message: "Created",
				}),
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
		[t],
	);

	const table = useReactTable({
		data,
		columns,
		state: {
			grouping,
			expanded,
			columnFilters,
			rowSelection,
		},
		getRowId: (row) => row.id,
		enableRowSelection: (row) => !row.getIsGrouped(),
		onRowSelectionChange: setRowSelection,
		onGroupingChange: setGrouping,
		onExpandedChange: setExpanded,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getGroupedRowModel: getGroupedRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		autoResetExpanded: false,
	});

	return {
		table,
		slugColumnWidth,
		rowSelection,
		setRowSelection,
		fetchNextTasksPage,
		hasNextTasksPage,
		isFetchingNextTasksPage,
		isLoadingTasks,
	};
}
