import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import {
	LuCopy,
	LuFolderPlus,
	LuPencil,
	LuPlus,
	LuTrash2,
} from "react-icons/lu";

interface DashboardSidebarProjectContextMenuProps {
	id: string;
	onCreateSection: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	onDelete: () => void;
	onNewWorkspace: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarProjectContextMenu({
	id,
	onCreateSection,
	onRemoveFromSidebar,
	onRename,
	onDelete,
	onNewWorkspace,
	children,
}: DashboardSidebarProjectContextMenuProps) {
	const handleCopyId = () => {
		navigator.clipboard.writeText(id);
		toast.success("Project ID copied");
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					Rename
				</ContextMenuItem>
				<ContextMenuItem onSelect={onNewWorkspace}>
					<LuPlus className="size-4 mr-2" />
					New Workspace
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					New Section
				</ContextMenuItem>
				<ContextMenuItem onSelect={handleCopyId}>
					<LuCopy className="size-4 mr-2" />
					Copy ID
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onRemoveFromSidebar}>
					<LuTrash2 className="size-4 mr-2" />
					Remove from Sidebar
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={onDelete}
					className="text-destructive focus:text-destructive"
				>
					<LuTrash2 className="size-4 mr-2 text-destructive" />
					Delete
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
