import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { LuCopy, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";

interface V2ProjectContextMenuProps {
	id: string;
	onRename: () => void;
	onDelete: () => void;
	onNewWorkspace: () => void;
	children: React.ReactNode;
}

export function V2ProjectContextMenu({
	id,
	onRename,
	onDelete,
	onNewWorkspace,
	children,
}: V2ProjectContextMenuProps) {
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
				<ContextMenuItem onSelect={handleCopyId}>
					<LuCopy className="size-4 mr-2" />
					Copy ID
				</ContextMenuItem>
				<ContextMenuSeparator />
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
