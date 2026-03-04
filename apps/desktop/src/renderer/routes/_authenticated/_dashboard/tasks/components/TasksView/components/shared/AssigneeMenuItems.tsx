import type { SelectUser } from "@superset/db/schema";
import { Avatar } from "@superset/ui/atoms/Avatar";
import type { ReactNode } from "react";
import { HiOutlineUserCircle } from "react-icons/hi2";

interface MenuItemProps {
	children: ReactNode;
	onSelect: () => void;
	className?: string;
}

interface AssigneeMenuItemsProps {
	users: SelectUser[];
	currentAssigneeId: string | null;
	onSelect: (userId: string | null) => void;
	MenuItem: React.ComponentType<MenuItemProps>;
}

export function AssigneeMenuItems({
	users,
	currentAssigneeId,
	onSelect,
	MenuItem,
}: AssigneeMenuItemsProps) {
	return (
		<>
			<MenuItem
				onSelect={() => onSelect(null)}
				className="flex items-center gap-2"
			>
				<HiOutlineUserCircle className="size-5 text-muted-foreground shrink-0" />
				<span className="text-sm">No assignee</span>
				{!currentAssigneeId && (
					<span className="ml-auto text-xs text-muted-foreground">✓</span>
				)}
			</MenuItem>

			{users.map((user) => {
				const isSelected = user.id === currentAssigneeId;
				return (
					<MenuItem
						key={user.id}
						onSelect={() => onSelect(user.id)}
						className="flex items-center gap-2"
					>
						<Avatar size="xs" fullName={user.name} image={user.image} />
						<div className="flex flex-col">
							<span className="text-sm">{user.name}</span>
							<span className="text-xs text-muted-foreground">
								{user.email}
							</span>
						</div>
						{isSelected && (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						)}
					</MenuItem>
				);
			})}
		</>
	);
}
