import type { TaskPriority } from "@superset/db/enums";
import type { ReactNode } from "react";
import { ALL_PRIORITIES } from "../../utils/sorting";
import { PriorityIcon } from "./PriorityIcon";

interface MenuItemProps {
	children: ReactNode;
	onSelect: () => void;
	className?: string;
}

interface PriorityMenuItemsProps {
	currentPriority: TaskPriority;
	statusType?: string;
	onSelect: (priority: TaskPriority) => void;
	MenuItem: React.ComponentType<MenuItemProps>;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

export function PriorityMenuItems({
	currentPriority,
	statusType,
	onSelect,
	MenuItem,
}: PriorityMenuItemsProps) {
	return (
		<>
			{ALL_PRIORITIES.map((priority) => {
				const isSelected = priority === currentPriority;
				return (
					<MenuItem
						key={priority}
						onSelect={() => onSelect(priority)}
						className="flex items-center gap-3 px-3 py-2"
					>
						<PriorityIcon priority={priority} statusType={statusType} />
						<span className="text-sm flex-1">{PRIORITY_LABELS[priority]}</span>
						{isSelected && <span className="text-sm">✓</span>}
					</MenuItem>
				);
			})}
		</>
	);
}
