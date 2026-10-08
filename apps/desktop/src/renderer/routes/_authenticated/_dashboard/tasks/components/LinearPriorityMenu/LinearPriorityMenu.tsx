import type { TaskPriority } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";
import { PriorityMenuItems } from "../TasksView/components/shared/PriorityMenuItems";

interface LinearPriorityMenuProps {
	priority: TaskPriority;
	onSelect: (priority: TaskPriority) => void;
	children: ReactNode;
}

export function LinearPriorityMenu({
	priority,
	onSelect,
	children,
}: LinearPriorityMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<PriorityMenuItems
					currentPriority={priority}
					onSelect={(next) => {
						if (next !== priority) onSelect(next);
					}}
					MenuItem={DropdownMenuItem}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
