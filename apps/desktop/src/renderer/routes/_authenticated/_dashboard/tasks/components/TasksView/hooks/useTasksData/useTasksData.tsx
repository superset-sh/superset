import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";
import type { RouterOutputs } from "@superset/trpc";
import { useCallback, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { TabValue } from "../../components/TasksTopBar";
import { matchesTaskStatusFilter } from "../../utils/matchesTaskStatusFilter";
import { compareTasks } from "../../utils/sorting";
import { useHybridSearch } from "../useHybridSearch";

export const TASK_PAGE_SIZE = 100;

/**
 * Shared by every picker that only needs a recent window of tasks so they hit
 * one React Query cache entry.
 */
export const TASK_PICKER_INPUT = { limit: 200 };
export const TASK_LIST_REFETCH_INTERVAL = 15_000;

export type TaskAssignee = NonNullable<
	RouterOutputs["task"]["listPage"]["items"][number]["assignee"]
>;

export type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: TaskAssignee | null;
};

export interface TasksPagination {
	fetchNextTasksPage: () => void;
	hasNextTasksPage: boolean;
	isFetchingNextTasksPage: boolean;
	isLoadingTasks: boolean;
}

interface UseTasksDataParams {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	linearProjectFilter: string | null;
}

export function useTasksJoinedWithStatuses(): TasksPagination & {
	tasks: TaskWithStatus[];
	statuses: SelectTaskStatus[];
} {
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		cloudTrpc.task.listPage.useInfiniteQuery(
			{ limit: TASK_PAGE_SIZE },
			{
				getNextPageParam: (page) => page.nextCursor,
				refetchInterval: TASK_LIST_REFETCH_INTERVAL,
			},
		);
	const { data: statusRows, isLoading: isLoadingStatuses } =
		cloudTrpc.task.statuses.list.useQuery(undefined, {
			refetchInterval: TASK_LIST_REFETCH_INTERVAL,
		});

	const statuses = useMemo(() => statusRows ?? [], [statusRows]);

	const taskRows = useMemo(
		() => data?.pages.flatMap((page) => page.items),
		[data],
	);

	const tasks = useMemo(() => {
		if (!taskRows || statuses.length === 0) return [];
		const statusById = new Map(statuses.map((status) => [status.id, status]));
		return taskRows
			.flatMap((row) => {
				const status = statusById.get(row.task.statusId);
				if (!status) return [];
				return [{ ...row.task, status, assignee: row.assignee }];
			})
			.sort(compareTasks);
	}, [taskRows, statuses]);

	const fetchNextTasksPage = useCallback(() => {
		void fetchNextPage();
	}, [fetchNextPage]);

	return {
		tasks,
		statuses,
		fetchNextTasksPage,
		hasNextTasksPage: hasNextPage,
		isFetchingNextTasksPage: isFetchingNextPage,
		isLoadingTasks: isLoading || isLoadingStatuses,
	};
}

export function useTasksData({
	filterTab,
	searchQuery,
	assigneeFilter,
	linearProjectFilter,
}: UseTasksDataParams): TasksPagination & {
	data: TaskWithStatus[];
	allStatuses: SelectTaskStatus[];
} {
	const {
		tasks: sortedData,
		statuses: allStatuses,
		fetchNextTasksPage,
		hasNextTasksPage,
		isFetchingNextTasksPage,
		isLoadingTasks,
	} = useTasksJoinedWithStatuses();

	const { search } = useHybridSearch(sortedData);

	const searchedData = useMemo(() => {
		if (!searchQuery.trim()) {
			return sortedData;
		}
		const results = search(searchQuery);
		return results.map((r) => r.item);
	}, [sortedData, searchQuery, search]);

	const filteredData = useMemo(() => {
		let result = searchedData;

		if (linearProjectFilter) {
			result = result.filter(
				(task) => task.externalProjectId === linearProjectFilter,
			);
		}

		if (filterTab !== "all") {
			result = result.filter((task) =>
				matchesTaskStatusFilter(task.status.type, filterTab),
			);
		}

		if (assigneeFilter) {
			result = result.filter((task) => {
				if (assigneeFilter === "unassigned") {
					return task.assigneeId === null && task.assigneeExternalId === null;
				}
				if (assigneeFilter.startsWith("ext:")) {
					return task.assigneeExternalId === assigneeFilter.slice(4);
				}
				return task.assigneeId === assigneeFilter;
			});
		}

		return result;
	}, [searchedData, filterTab, assigneeFilter, linearProjectFilter]);

	return {
		data: filteredData,
		allStatuses,
		fetchNextTasksPage,
		hasNextTasksPage,
		isFetchingNextTasksPage,
		isLoadingTasks,
	};
}
