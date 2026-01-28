import type { SelectTaskStatus } from "@superset/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	StatusIcon,
	type StatusType,
} from "../../../../../components/TasksView/components/shared/StatusIcon";
import { StatusMenuItems } from "../../../../../components/TasksView/components/shared/StatusMenuItems";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";
import { compareStatusesForDropdown } from "../../../../../components/TasksView/utils/sorting";

interface StatusPropertyProps {
	task: TaskWithStatus;
}

export function StatusProperty({ task }: StatusPropertyProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	const { data: allStatuses } = useLiveQuery(
		(q) => (open ? q.from({ taskStatuses: collections.taskStatuses }) : null),
		[collections, open],
	);

	const statuses = useMemo(() => allStatuses || [], [allStatuses]);
	const currentStatus = task.status;

	const sortedStatuses = useMemo(() => {
		return statuses.sort(compareStatusesForDropdown);
	}, [statuses]);

	const handleSelectStatus = (newStatus: SelectTaskStatus) => {
		if (newStatus.id === currentStatus.id) {
			setOpen(false);
			return;
		}

		try {
			collections.tasks.update(task.id, (draft) => {
				draft.statusId = newStatus.id;
			});
			setOpen(false);
		} catch (error) {
			console.error("[StatusProperty] Failed to update status:", error);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-2 hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors w-full"
				>
					<StatusIcon
						type={currentStatus.type as StatusType}
						color={currentStatus.color}
						progress={currentStatus.progressPercent ?? undefined}
					/>
					<span className="text-sm">{currentStatus.name}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48 p-1">
				<div className="max-h-64 overflow-y-auto">
					<StatusMenuItems
						statuses={sortedStatuses}
						currentStatusId={currentStatus.id}
						onSelect={handleSelectStatus}
						MenuItem={DropdownMenuItem}
					/>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
