import type { TaskPriority } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import { PriorityMenuItems } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityMenuItems";

const PRIORITY_LABELS: Record<TaskPriority, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

interface CreateTaskPriorityPickerProps {
	value: TaskPriority;
	statusType?: string;
	onChange: (value: TaskPriority) => void;
}

export function CreateTaskPriorityPicker({
	value,
	statusType,
	onChange,
}: CreateTaskPriorityPickerProps) {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex h-9 items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 text-sm transition-colors hover:bg-muted/60"
				>
					<PriorityIcon priority={value} statusType={statusType} />
					<span>{PRIORITY_LABELS[value]}</span>
					<HiChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52 p-1">
				<PriorityMenuItems
					currentPriority={value}
					statusType={statusType}
					onSelect={(priority) => {
						onChange(priority);
						setOpen(false);
					}}
					MenuItem={DropdownMenuItem}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
