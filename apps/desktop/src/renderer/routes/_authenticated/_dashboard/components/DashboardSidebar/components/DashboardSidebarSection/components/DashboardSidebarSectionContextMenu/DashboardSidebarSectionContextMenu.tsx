import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { LuFolderOpen, LuPencil, LuTrash2 } from "react-icons/lu";

interface DashboardSidebarSectionContextMenuProps {
	isCollapsed: boolean;
	onRename: () => void;
	onToggleCollapse: () => void;
	onDelete: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarSectionContextMenu({
	isCollapsed,
	onRename,
	onToggleCollapse,
	onDelete,
	children,
}: DashboardSidebarSectionContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					Rename Section
				</ContextMenuItem>
				<ContextMenuItem onSelect={onToggleCollapse}>
					<LuFolderOpen className="size-4 mr-2" />
					{isCollapsed ? "Expand Section" : "Collapse Section"}
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={onDelete}
					className="text-destructive focus:text-destructive"
				>
					<LuTrash2 className="size-4 mr-2 text-destructive" />
					Delete Section
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
