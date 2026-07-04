import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";
import { LuClock, LuPencil, LuPlay, LuTrash2 } from "react-icons/lu";

interface AutomationActionsMenuItemsProps {
	kind: "context" | "dropdown";
	isOwner: boolean;
	onEdit: () => void;
	onRunNow: () => void;
	onHistory: () => void;
	onDelete: () => void;
}

export function AutomationActionsMenuItems({
	kind,
	isOwner,
	onEdit,
	onRunNow,
	onHistory,
	onDelete,
}: AutomationActionsMenuItemsProps) {
	const renderItem = ({
		children,
		destructive = false,
		onSelect,
	}: {
		children: ReactNode;
		destructive?: boolean;
		onSelect: () => void;
	}) => {
		const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
		return (
			<Item
				onSelect={onSelect}
				variant={destructive ? "destructive" : "default"}
			>
				{children}
			</Item>
		);
	};

	return (
		<>
			{renderItem({
				onSelect: onEdit,
				children: (
					<>
						<LuPencil className="size-4" />
						{isOwner ? "Edit" : "View"}
					</>
				),
			})}
			{isOwner && (
				<>
					{renderItem({
						onSelect: onRunNow,
						children: (
							<>
								<LuPlay className="size-4" />
								Run now
							</>
						),
					})}
					{renderItem({
						onSelect: onHistory,
						children: (
							<>
								<LuClock className="size-4" />
								Version history
							</>
						),
					})}
					{kind === "context" ? (
						<ContextMenuSeparator />
					) : (
						<DropdownMenuSeparator />
					)}
					{renderItem({
						destructive: true,
						onSelect: onDelete,
						children: (
							<>
								<LuTrash2 className="size-4" />
								Delete
							</>
						),
					})}
				</>
			)}
		</>
	);
}
