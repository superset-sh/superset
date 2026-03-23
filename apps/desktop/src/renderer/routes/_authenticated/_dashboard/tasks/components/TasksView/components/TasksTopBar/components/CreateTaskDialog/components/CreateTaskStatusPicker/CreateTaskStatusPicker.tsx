import type { SelectTaskStatus } from "@superset/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useMemo, useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { StatusMenuItems } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusMenuItems";
import { compareStatusesForDropdown } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/utils/sorting";

interface CreateTaskStatusPickerProps {
	statuses: SelectTaskStatus[];
	value: string | null;
	onChange: (value: string) => void;
}

export function CreateTaskStatusPicker({
	statuses,
	value,
	onChange,
}: CreateTaskStatusPickerProps) {
	const [open, setOpen] = useState(false);

	const currentStatus = useMemo(
		() => statuses.find((status) => status.id === value) ?? null,
		[statuses, value],
	);

	const sortedStatuses = useMemo(
		() => [...statuses].sort(compareStatusesForDropdown),
		[statuses],
	);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex h-9 items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 text-sm transition-colors hover:bg-muted/60"
					disabled={sortedStatuses.length === 0}
				>
					{currentStatus ? (
						<>
							<StatusIcon
								type={currentStatus.type as StatusType}
								color={currentStatus.color}
								progress={currentStatus.progressPercent ?? undefined}
							/>
							<span>{currentStatus.name}</span>
						</>
					) : (
						<span className="text-muted-foreground">Status</span>
					)}
					<HiChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52 p-1">
				<StatusMenuItems
					statuses={sortedStatuses}
					currentStatusId={value ?? ""}
					onSelect={(status) => {
						onChange(status.id);
						setOpen(false);
					}}
					MenuItem={DropdownMenuItem}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
