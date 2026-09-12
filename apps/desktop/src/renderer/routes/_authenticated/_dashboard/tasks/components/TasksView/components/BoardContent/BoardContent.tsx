import { Trans } from "@lingui/react/macro";
import { HiCheckCircle } from "react-icons/hi2";
import { LuRefreshCw } from "react-icons/lu";
import { useAutoLoadEmptyPages } from "../../hooks/useAutoLoadEmptyPages";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { useTasksData } from "../../hooks/useTasksData";
import { TasksBoardView } from "../TasksBoardView";
import type { TabValue } from "../TasksTopBar";

interface BoardContentProps {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	linearProjectFilter: string | null;
	onTaskClick: (task: TaskWithStatus) => void;
}

export function BoardContent({
	filterTab,
	searchQuery,
	assigneeFilter,
	linearProjectFilter,
	onTaskClick,
}: BoardContentProps) {
	const {
		data,
		allStatuses,
		fetchNextTasksPage,
		hasNextTasksPage,
		isFetchingNextTasksPage,
		isLoadingTasks,
	} = useTasksData({
		filterTab,
		searchQuery,
		assigneeFilter,
		linearProjectFilter,
	});

	useAutoLoadEmptyPages({
		isEmpty: data.length === 0,
		isLoading: isLoadingTasks,
		filterKey: `${filterTab}\0${searchQuery}\0${assigneeFilter ?? ""}\0${linearProjectFilter ?? ""}`,
		hasNextPage: hasNextTasksPage,
		isFetchingNextPage: isFetchingNextTasksPage,
		onLoadMore: fetchNextTasksPage,
	});

	if (data.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<HiCheckCircle className="h-8 w-8" />
					<span className="text-sm">
						<Trans>No tasks found</Trans>
					</span>
				</div>
			</div>
		);
	}

	return (
		<>
			<TasksBoardView
				data={data}
				allStatuses={allStatuses}
				onTaskClick={onTaskClick}
				hasNextPage={hasNextTasksPage}
				isFetchingNextPage={isFetchingNextTasksPage}
				onLoadMore={fetchNextTasksPage}
			/>
			{isFetchingNextTasksPage && (
				<div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
					<LuRefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" />
					<span>
						<Trans>Loading more…</Trans>
					</span>
				</div>
			)}
		</>
	);
}
