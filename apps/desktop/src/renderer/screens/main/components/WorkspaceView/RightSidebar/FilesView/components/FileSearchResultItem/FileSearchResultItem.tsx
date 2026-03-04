import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
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
import { useFileDrag, usePathActions } from "../../../ChangesView/hooks";
import { SEARCH_RESULT_ROW_HEIGHT } from "../../constants";
import { getFileIcon } from "../../utils";

interface FileSearchResultItemProps {
	entry: DirectoryEntry;
	worktreePath: string;
	projectId?: string;
	onActivate: (entry: DirectoryEntry) => void;
	onOpenInEditor: (entry: DirectoryEntry) => void;
	onNewFile: (parentPath: string) => void;
	onNewFolder: (parentPath: string) => void;
	onRename: (entry: DirectoryEntry) => void;
	onDelete: (entry: DirectoryEntry) => void;
}

const PATH_LABEL_MAX_CHARS = 48;

function getFolderLabel(relativePath: string): string {
	const normalized = relativePath.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash <= 0) {
		return "root";
	}
	return normalized.slice(0, lastSlash);
}

function truncatePathStart(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	const sliceLength = Math.max(1, maxLength - 3);
	return `...${value.slice(value.length - sliceLength)}`;
}

export function FileSearchResultItem({
	entry,
	worktreePath,
	projectId,
	onActivate,
	onOpenInEditor,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: FileSearchResultItemProps) {
	const { icon: Icon, color } = getFileIcon(
		entry.name,
		entry.isDirectory,
		false,
	);
	const folderLabel = getFolderLabel(entry.relativePath);
	const folderLabelDisplay = truncatePathStart(
		folderLabel,
		PATH_LABEL_MAX_CHARS,
	);

	const parentPath = entry.isDirectory
		? entry.path
		: entry.path.split("/").slice(0, -1).join("/") || worktreePath;

	const { copyPath, copyRelativePath, revealInFinder, openInEditor } =
		usePathActions({
			absolutePath: entry.path,
			relativePath: entry.relativePath,
			cwd: worktreePath,
			projectId,
		});

	const fileDragProps = useFileDrag({ absolutePath: entry.path });

	const handleClick = () => {
		if (!entry.isDirectory) {
			onActivate(entry);
		}
	};

	const handleDoubleClick = () => {
		onOpenInEditor(entry);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (!entry.isDirectory) {
				onActivate(entry);
			}
		}
	};

	const itemContent = (
		<div
			{...fileDragProps}
			role="treeitem"
			tabIndex={0}
			style={{ height: SEARCH_RESULT_ROW_HEIGHT }}
			className={cn(
				"flex items-center gap-1 px-1 cursor-pointer select-none",
				"hover:bg-accent/50 transition-colors",
			)}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
		>
			<span className="flex items-center justify-center w-4 h-4 shrink-0" />
			<div className="flex flex-col min-w-0 flex-1 gap-0.5">
				<span
					className="text-[10px] text-muted-foreground truncate"
					title={entry.relativePath}
				>
					{folderLabelDisplay}
				</span>
				<div className="flex items-center gap-1 min-w-0">
					<Icon className={cn("size-4 shrink-0", color)} />
					<span className="flex-1 min-w-0 text-xs truncate">{entry.name}</span>
				</div>
			</div>
		</div>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{itemContent}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem onClick={() => onNewFile(parentPath)}>
					<LuFile className="mr-2 size-4" />
					New File
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onNewFolder(parentPath)}>
					<LuFolder className="mr-2 size-4" />
					New Folder
				</ContextMenuItem>

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
				<ContextMenuItem onClick={openInEditor}>
					<LuExternalLink className="mr-2 size-4" />
					Open in Editor
				</ContextMenuItem>

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
			</ContextMenuContent>
		</ContextMenu>
	);
}
