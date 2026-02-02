import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	LuClipboard,
	LuCopy,
	LuExternalLink,
	LuFile,
	LuFolder,
	LuFolderOpen,
	LuPencil,
	LuTrash2,
} from "react-icons/lu";
import type { DirectoryEntry } from "shared/file-tree-types";
import { usePathActions } from "../../../ChangesView/hooks";

interface FileTreeContextMenuProps {
	children: React.ReactNode;
	entry: DirectoryEntry | null;
	worktreePath: string;
	onNewFile: (parentPath: string) => void;
	onNewFolder: (parentPath: string) => void;
	onRename: (entry: DirectoryEntry) => void;
	onDelete: (entry: DirectoryEntry) => void;
}

export function FileTreeContextMenu({
	children,
	entry,
	worktreePath,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: FileTreeContextMenuProps) {
	const targetPath = entry?.path ?? worktreePath;
	const parentPath = entry?.isDirectory ? entry.path : worktreePath;

	const { copyPath, copyRelativePath, revealInFinder, openInEditor } =
		usePathActions({
			absolutePath: targetPath,
			relativePath: entry?.relativePath,
			cwd: worktreePath,
		});

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild className="flex-1 min-h-0">
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem onClick={() => onNewFile(parentPath)}>
					<LuFile className="mr-2 size-4" />
					New File
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onNewFolder(parentPath)}>
					<LuFolder className="mr-2 size-4" />
					New Folder
				</ContextMenuItem>

				{entry && (
					<>
						<ContextMenuSeparator />

						<ContextMenuItem onClick={copyPath}>
							<LuClipboard className="mr-2 size-4" />
							Copy Path
						</ContextMenuItem>
						<ContextMenuItem onClick={copyRelativePath}>
							<LuCopy className="mr-2 size-4" />
							Copy Relative Path
						</ContextMenuItem>

						<ContextMenuSeparator />

						<ContextMenuItem onClick={revealInFinder}>
							<LuFolderOpen className="mr-2 size-4" />
							Reveal in Finder
						</ContextMenuItem>
						{!entry.isDirectory && (
							<ContextMenuItem onClick={openInEditor}>
								<LuExternalLink className="mr-2 size-4" />
								Open in Editor
							</ContextMenuItem>
						)}

						<ContextMenuSeparator />

						<ContextMenuItem onClick={() => onRename(entry)}>
							<LuPencil className="mr-2 size-4" />
							Rename
						</ContextMenuItem>
						<ContextMenuItem
							onClick={() => onDelete(entry)}
							className="text-destructive focus:text-destructive"
						>
							<LuTrash2 className="mr-2 size-4" />
							Delete
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
