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
} from "../../../../components/shared/StatusIcon";
import { StatusMenuItems } from "../../../../components/shared/StatusMenuItems";
import { compareStatusesForDropdown } from "../../../../utils/sorting";
import type { TaskWithStatus } from "../../useTasksTable";

interface StatusCellProps {
	taskWithStatus: TaskWithStatus;
}

export function StatusCell({ taskWithStatus }: StatusCellProps) {
	const { tasks: taskActions } = useOptimisticActions();
	const [open, setOpen] = useState(false);

	const { data: allStatuses } = cloudTrpc.task.statuses.list.useQuery(
		undefined,
		{ enabled: open },
	);

	const currentStatus = taskWithStatus.status;

	const sortedStatuses = useMemo(() => {
		return [...(allStatuses ?? [])].sort(compareStatusesForDropdown);
	}, [allStatuses]);

	const handleSelectStatus = (newStatus: SelectTaskStatus) => {
		if (newStatus.id === currentStatus.id) {
			setOpen(false);
			return;
		}

		const transaction = taskActions.updateStatus(
			taskWithStatus.id,
			newStatus.id,
		);
		if (transaction) {
			setOpen(false);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="p-0 cursor-pointer border-0"
					onClick={(e) => e.stopPropagation()}
				>
					<StatusIcon
						type={currentStatus.type as StatusType}
						color={currentStatus.color}
						progress={currentStatus.progressPercent ?? undefined}
						showHover={true}
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-48 p-1"
				onClick={(e) => e.stopPropagation()}
			>
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
