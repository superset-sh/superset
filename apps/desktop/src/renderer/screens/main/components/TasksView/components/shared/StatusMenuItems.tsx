import type { SelectTaskStatus } from "@superset/db/schema";
import type { ReactNode } from "react";
import { StatusIcon, type StatusType } from "./StatusIcon";

interface MenuItemProps {
	children: ReactNode;
	onSelect: () => void;
	className?: string;
}

interface StatusMenuItemsProps {
	statuses: SelectTaskStatus[];
	currentStatusId: string;
	onSelect: (status: SelectTaskStatus) => void;
	MenuItem: React.ComponentType<MenuItemProps>;
}

export function StatusMenuItems({
	statuses,
	currentStatusId,
	onSelect,
	MenuItem,
}: StatusMenuItemsProps) {
	return (
		<>
			{statuses.map((status) => {
				const isSelected = status.id === currentStatusId;
				return (
					<MenuItem
						key={status.id}
						onSelect={() => onSelect(status)}
						className="flex items-center gap-3 px-3 py-2"
					>
						<StatusIcon
							type={status.type as StatusType}
							color={status.color}
							progress={status.progressPercent ?? undefined}
						/>
						<span className="text-sm flex-1">{status.name}</span>
						{isSelected && <span className="text-sm">✓</span>}
					</MenuItem>
				);
			})}
		</>
	);
}
