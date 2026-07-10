import type { TaskPriority } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { CellContext } from "@tanstack/react-table";
import { useState } from "react";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { PriorityIcon } from "../../../../components/shared/PriorityIcon";
import { ALL_PRIORITIES } from "../../../../utils/sorting";
import type { TaskWithStatus } from "../../useTasksTable";

interface PriorityCellProps {
	info: CellContext<TaskWithStatus, TaskPriority>;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

export function PriorityCell({ info }: PriorityCellProps) {
	const { tasks: taskActions } = useOptimisticCollectionActions();
	const [open, setOpen] = useState(false);

	const task = info.row.original;
	const currentPriority = info.getValue();
	const statusType = task.status.type;

	const handleSelectPriority = (newPriority: TaskPriority) => {
		if (newPriority === currentPriority) {
			setOpen(false);
			return;
		}

		const transaction = taskActions.updatePriority(task.id, newPriority);
		if (transaction) {
			setOpen(false);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="group p-0 cursor-pointer border-0 transition-all"
					title={PRIORITY_LABELS[currentPriority]}
					onClick={(e) => e.stopPropagation()}
				>
					<PriorityIcon
						priority={currentPriority}
						statusType={statusType}
						showHover={true}
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-52 p-1"
				onClick={(e) => e.stopPropagation()}
			>
				{ALL_PRIORITIES.map((priority) => (
					<DropdownMenuItem
						key={priority}
						onSelect={() => handleSelectPriority(priority)}
						className="flex items-center gap-3 px-3 py-2"
					>
						<PriorityIcon priority={priority} statusType={statusType} />
						<span className="text-sm flex-1">{PRIORITY_LABELS[priority]}</span>
						{priority === currentPriority && <span className="text-sm">✓</span>}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
