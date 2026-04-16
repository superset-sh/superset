import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { PathActionsMenuItems } from "../PathActionsMenuItems";

interface FolderContextMenuProps {
	absolutePath: string;
	relativePath?: string;
	onNewFile: () => void;
	onNewFolder: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function FolderContextMenu({
	absolutePath,
	relativePath,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: FolderContextMenuProps) {
	return (
		<ContextMenuContent className="w-56">
			<ContextMenuItem onSelect={() => setTimeout(onNewFile, 0)}>
				New File...
			</ContextMenuItem>
			<ContextMenuItem onSelect={() => setTimeout(onNewFolder, 0)}>
				New Folder...
			</ContextMenuItem>
			<ContextMenuSeparator />
			<PathActionsMenuItems
				absolutePath={absolutePath}
				relativePath={relativePath}
			/>
			<ContextMenuSeparator />
			<ContextMenuItem onSelect={() => setTimeout(onRename, 0)}>
				Rename...
			</ContextMenuItem>
			<ContextMenuItem variant="destructive" onSelect={onDelete}>
				Delete
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
