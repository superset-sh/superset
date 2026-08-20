import type { SelectTaskStatus } from "@superset/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useMemo, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
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
	const { tasks: taskActions } = useOptimisticActions();
	const [open, setOpen] = useState(false);

	const { data: allStatuses } = cloudTrpc.task.statuses.list.useQuery(
		undefined,
		{ enabled: open },
	);

	const currentStatus = task.status;

	const sortedStatuses = useMemo(() => {
		return [...(allStatuses ?? [])].sort(compareStatusesForDropdown);
	}, [allStatuses]);

	const handleSelectStatus = (newStatus: SelectTaskStatus) => {
		if (newStatus.id === currentStatus.id) {
			setOpen(false);
			return;
		}

		const transaction = taskActions.updateStatus(task.id, newStatus.id);
		if (transaction) {
			setOpen(false);
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
