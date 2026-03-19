import { Spinner } from "@superset/ui/spinner";
import { HiCheckCircle } from "react-icons/hi2";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { useTasksData } from "../../hooks/useTasksData";
import { TasksBoardView } from "../TasksBoardView";
import type { TabValue } from "../TasksTopBar";

interface BoardContentProps {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	onTaskClick: (task: TaskWithStatus) => void;
}

export function BoardContent({
	filterTab,
	searchQuery,
	assigneeFilter,
	onTaskClick,
}: BoardContentProps) {
	const { data, allStatuses, isLoading } = useTasksData({
		filterTab,
		searchQuery,
		assigneeFilter,
	});

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}

	if (data.length === 0) {
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
		<TasksBoardView
			data={data}
			allStatuses={allStatuses}
			onTaskClick={onTaskClick}
		/>
	);
}
