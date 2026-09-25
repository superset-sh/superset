import { useLingui } from "@lingui/react/macro";
import type { TaskPriority } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useState } from "react";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { PriorityIcon } from "../../../../../components/TasksView/components/shared/PriorityIcon";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";
import { ALL_PRIORITIES } from "../../../../../components/TasksView/utils/sorting";

interface PriorityPropertyProps {
	task: TaskWithStatus;
}

export function PriorityProperty({ task }: PriorityPropertyProps) {
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

	const currentPriority = task.priority;
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
					className="flex items-center gap-2 hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors w-full"
				>
					<PriorityIcon priority={currentPriority} statusType={statusType} />
					<span className="text-sm capitalize">
						{priorityLabels[currentPriority]}
					</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52 p-1">
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
