import { useState } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { SelectTask } from "@superset/db/schema";
import { taskPriorityValues, type TaskPriority } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { PriorityIcon } from "../../PriorityIcon";

interface PriorityCellProps {
	info: CellContext<SelectTask, TaskPriority>;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

const PRIORITY_NUMBERS: Record<TaskPriority, number> = {
	none: 0,
	urgent: 1,
	high: 2,
	medium: 3,
	low: 4,
};

export function PriorityCell({ info }: PriorityCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);

	const task = info.row.original;
	const currentPriority = info.getValue();
	const statusType = (task as any).status?.type;

	const handleSelectPriority = async (newPriority: TaskPriority) => {
		if (newPriority === currentPriority) {
			setOpen(false);
			return;
		}

		try {
			await collections.tasks.update(task.id, (draft) => {
				draft.priority = newPriority;
			});
			setOpen(false);
		} catch (error) {
			console.error("[PriorityCell] Failed to update priority:", error);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					className="p-0 cursor-pointer border-0 hover:brightness-110 transition-all"
					title={PRIORITY_LABELS[currentPriority]}
				>
					<PriorityIcon priority={currentPriority} statusType={statusType} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52 p-1">
				{taskPriorityValues.map((priority: TaskPriority) => (
					<DropdownMenuItem
						key={priority}
						onSelect={() => handleSelectPriority(priority)}
						className="flex items-center gap-3 px-3 py-2"
					>
						<PriorityIcon priority={priority} statusType={statusType} />
						<span className="text-sm flex-1">{PRIORITY_LABELS[priority]}</span>
						{priority === currentPriority && (
							<span className="text-sm">✓</span>
						)}
						<span className="text-xs text-muted-foreground tabular-nums">
							{PRIORITY_NUMBERS[priority]}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
