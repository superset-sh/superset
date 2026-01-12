import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { compareStatusesForDropdown } from "../../../utils/taskSorting";
import { StatusIcon } from "../../StatusIcon";

// Task with joined status data
type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
};

interface StatusCellProps {
	taskWithStatus: TaskWithStatus;
}

export function StatusCell({ taskWithStatus }: StatusCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	// Lazy load statuses only when dropdown opens
	const { data: allStatuses } = useLiveQuery(
		(q) => (open ? q.from({ taskStatuses: collections.taskStatuses }) : null),
		[collections, open],
	);

	const statuses = useMemo(() => allStatuses || [], [allStatuses]);
	const currentStatus = taskWithStatus.status;

	// Sort statuses by workflow order (backlog → unstarted → started → completed → canceled)
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
				<button className="p-0 cursor-pointer border-0">
					<StatusIcon
						type={currentStatus.type as any}
						color={currentStatus.color}
						progress={currentStatus.progressPercent ?? undefined}
						showHover={true}
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48 p-1">
				<div className="max-h-64 overflow-y-auto">
					{sortedStatuses.map((status) => (
						<DropdownMenuItem
							key={status.id}
							onSelect={() => handleSelectStatus(status)}
							className="flex items-center gap-3 px-3 py-2"
						>
							<StatusIcon
								type={status.type as any}
								color={status.color}
								progress={status.progressPercent ?? undefined}
							/>
							<span className="text-sm flex-1">{status.name}</span>
							{status.id === currentStatus.id && (
								<span className="text-sm">✓</span>
							)}
						</DropdownMenuItem>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
