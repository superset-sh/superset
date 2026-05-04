import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { PathActions } from "../PathActions";

interface FolderMenuItemsProps {
	absolutePath: string;
	relativePath: string;
	onNewFile: () => void;
	onNewFolder: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function FolderMenuItems({
	absolutePath,
	relativePath,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: FolderMenuItemsProps) {
	return (
		<>
			<DropdownMenuItem onSelect={() => setTimeout(onNewFile, 0)}>
				<FilePlus />
				New File...
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={() => setTimeout(onNewFolder, 0)}>
				<FolderPlus />
				New Folder...
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<PathActions absolutePath={absolutePath} relativePath={relativePath} />
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={() => setTimeout(onRename, 0)}>
				<Pencil />
				Rename...
			</DropdownMenuItem>
			<DropdownMenuItem variant="destructive" onSelect={onDelete}>
				<Trash2 />
				Delete
			</DropdownMenuItem>
		</>
	);
}
