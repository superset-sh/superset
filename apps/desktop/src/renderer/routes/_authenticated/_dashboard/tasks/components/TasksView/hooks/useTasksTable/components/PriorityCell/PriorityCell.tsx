import { useLingui } from "@lingui/react/macro";
import type { TaskPriority } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { CellContext } from "@tanstack/react-table";
import { useState } from "react";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { PriorityIcon } from "../../../../components/shared/PriorityIcon";
import { ALL_PRIORITIES } from "../../../../utils/sorting";
import type { TaskWithStatus } from "../../useTasksTable";

interface PriorityCellProps {
	info: CellContext<TaskWithStatus, TaskPriority>;
}

export function PriorityCell({ info }: PriorityCellProps) {
	const { t } = useLingui();
	const priorityLabels: Record<TaskPriority, string> = {
		none: t({
			message: "No priority",
		}),
		urgent: t({
			message: "Urgent",
		}),
		high: t({
			message: "High",
		}),
		medium: t({
			message: "Medium",
		}),
		low: t({
			message: "Low",
		}),
	};
	const { tasks: taskActions } = useOptimisticActions();
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
					title={priorityLabels[currentPriority]}
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
						<span className="text-sm flex-1">{priorityLabels[priority]}</span>
						{priority === currentPriority && <span className="text-sm">✓</span>}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
