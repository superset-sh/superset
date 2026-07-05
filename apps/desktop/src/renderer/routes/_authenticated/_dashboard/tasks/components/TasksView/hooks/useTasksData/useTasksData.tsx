import type {
	SelectTask,
	SelectTaskStatus,
	SelectUser,
} from "@superset/db/schema";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TabValue } from "../../components/TasksTopBar";
import { compareTasks } from "../../utils/sorting";
import { useHybridSearch } from "../useHybridSearch";

export type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: SelectUser | null;
};

interface UseTasksDataParams {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
}

export function useTasksData({
	filterTab,
	searchQuery,
	assigneeFilter,
}: UseTasksDataParams): {
	data: TaskWithStatus[];
	allStatuses: SelectTaskStatus[];
} {
	const collections = useCollections();

	const { data: allData } = useLiveQuery(
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

	const { data: statusData } = useLiveQuery(
		(q) =>
			q
				.from({ taskStatuses: collections.taskStatuses })
				.select(({ taskStatuses }) => ({ ...taskStatuses })),
		[collections],
	);

	const allStatuses = useMemo(() => statusData ?? [], [statusData]);

	const sortedData = useMemo(() => {
		if (!allData) return [];
		return allData
			.map((task) => ({
				...task,
				assignee:
					typeof task.assignee?.id === "string"
						? (task.assignee as SelectUser)
						: null,
			}))
			.sort(compareTasks);
	}, [allData]);

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

		if (filterTab !== "all") {
			result = result.filter((task) => {
				const statusType = task.status.type;
				if (filterTab === "active") {
					return statusType === "started" || statusType === "unstarted";
				}
				if (filterTab === "backlog") {
					return statusType === "backlog";
				}
				return true;
			});
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
	}, [searchedData, filterTab, assigneeFilter]);

	return {
		data: filteredData,
		allStatuses,
	};
}
