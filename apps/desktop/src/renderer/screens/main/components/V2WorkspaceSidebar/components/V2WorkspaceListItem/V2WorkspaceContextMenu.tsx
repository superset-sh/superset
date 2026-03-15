import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { LuCopy, LuPencil, LuTrash2 } from "react-icons/lu";

interface V2WorkspaceContextMenuProps {
	id: string;
	onRename: () => void;
	onDelete: () => void;
	children: React.ReactNode;
}

export function V2WorkspaceContextMenu({
	id,
	onRename,
	onDelete,
	children,
}: V2WorkspaceContextMenuProps) {
	const handleCopyId = () => {
		navigator.clipboard.writeText(id);
		toast.success("Workspace ID copied");
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					Rename
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
