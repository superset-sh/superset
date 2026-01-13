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
} from "../../../../components/shared/StatusIcon";
import { StatusMenuItems } from "../../../../components/shared/StatusMenuItems";
import { compareStatusesForDropdown } from "../../../../utils/sorting";
import type { TaskWithStatus } from "../../useTasksTable";

interface StatusCellProps {
	taskWithStatus: TaskWithStatus;
}

export function StatusCell({ taskWithStatus }: StatusCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	const { data: allStatuses } = useLiveQuery(
		(q) => (open ? q.from({ taskStatuses: collections.taskStatuses }) : null),
		[collections, open],
	);

	const statuses = useMemo(() => allStatuses || [], [allStatuses]);
	const currentStatus = taskWithStatus.status;

	const sortedStatuses = useMemo(() => {
		return statuses.sort(compareStatusesForDropdown);
	}, [statuses]);

	const handleSelectStatus = (newStatus: SelectTaskStatus) => {
		if (newStatus.id === currentStatus.id) {
			setOpen(false);
			return;
		}

		try {
			collections.tasks.update(taskWithStatus.id, (draft) => {
				draft.statusId = newStatus.id;
			});
			setOpen(false);
		} catch (error) {
			console.error("[StatusCell] Failed to update status:", error);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button type="button" className="p-0 cursor-pointer border-0">
					<StatusIcon
						type={currentStatus.type as StatusType}
						color={currentStatus.color}
						progress={currentStatus.progressPercent ?? undefined}
						showHover={true}
					/>
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
