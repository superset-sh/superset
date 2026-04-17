import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { PathActionsMenuItems } from "../PathActionsMenuItems";

interface FileContextMenuProps {
	absolutePath: string;
	relativePath?: string;
	onRename: () => void;
	onDelete: () => void;
}

export function FileContextMenu({
	absolutePath,
	relativePath,
	onRename,
	onDelete,
}: FileContextMenuProps) {
	return (
		<ContextMenuContent className="w-56">
			<ContextMenuItem>Open to the Side</ContextMenuItem>
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
