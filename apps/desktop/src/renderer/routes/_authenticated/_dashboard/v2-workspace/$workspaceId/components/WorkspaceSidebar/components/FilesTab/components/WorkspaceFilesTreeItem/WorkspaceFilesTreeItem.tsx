import { ContextMenu, ContextMenuTrigger } from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { memo } from "react";
import { LuChevronDown, LuChevronRight, LuCircle } from "react-icons/lu";
import type { FileTreeNode } from "renderer/hooks/host-service/useFileTree";
import type { FileStatus } from "renderer/hooks/host-service/useGitStatusMap";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

import { FileContextMenu } from "./components/FileContextMenu";
import { FolderContextMenu } from "./components/FolderContextMenu";

const STATUS_TEXT_CLASS: Record<FileStatus, string> = {
	added: "text-green-700 dark:text-green-400",
	copied: "text-purple-700 dark:text-purple-400",
	changed: "text-yellow-600 dark:text-yellow-400",
	deleted: "text-red-700 dark:text-red-500",
	modified: "text-yellow-600 dark:text-yellow-400",
	renamed: "text-blue-600 dark:text-blue-400",
	untracked: "text-green-700 dark:text-green-400",
};

// Single-letter badge shown on the right of changed file rows, VS Code style.
const STATUS_LETTER: Record<FileStatus, string> = {
	added: "A",
	copied: "C",
	changed: "M",
	deleted: "D",
	modified: "M",
	renamed: "R",
	untracked: "U",
};

interface WorkspaceFilesTreeItemProps {
	node: FileTreeNode;
	depth: number;
	rowHeight: number;
	indent: number;
	selectedFilePath?: string;
	isHovered?: boolean;
	decoration?: FileStatus;
	isMuted?: boolean;
	onSelectFile: (absolutePath: string) => void;
	onToggleDirectory: (absolutePath: string) => void;
	onNewFile: (parentPath: string) => void;
	onNewFolder: (parentPath: string) => void;
	onRename: (absolutePath: string, name: string, isDirectory: boolean) => void;
	onDelete: (absolutePath: string, name: string, isDirectory: boolean) => void;
}

function WorkspaceFilesTreeItemComponent({
	node,
	depth,
	rowHeight,
	indent,
	selectedFilePath,
	isHovered,
	decoration,
	isMuted,
	onSelectFile,
	onToggleDirectory,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: WorkspaceFilesTreeItemProps) {
	const isFolder = node.kind === "directory";
	const isSelected = selectedFilePath === node.absolutePath;

	const nameColorClass = isMuted
		? "text-muted-foreground"
		: decoration
			? STATUS_TEXT_CLASS[decoration]
			: undefined;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					data-filepath={node.absolutePath}
					aria-expanded={isFolder ? node.isExpanded : undefined}
					className={cn(
						"flex w-full cursor-pointer select-none items-center gap-1 pr-4 text-left transition-colors",
						isFolder ? "bg-background" : undefined,
						isHovered && !isSelected
							? isFolder
								? "!bg-muted"
								: "!bg-accent/50"
							: undefined,
						isSelected ? "!bg-accent" : undefined,
					)}
					onClick={() =>
						isFolder
							? onToggleDirectory(node.absolutePath)
							: onSelectFile(node.absolutePath)
					}
					style={{
						height: rowHeight,
						paddingLeft: 8 + (depth - 1) * indent,
						...(isFolder
							? {
									position: "sticky" as const,
									top: (depth - 1) * rowHeight,
									zIndex: Math.max(1, 50 - depth),
								}
							: {}),
					}}
					type="button"
				>
					<span className="flex h-4 w-4 shrink-0 items-center justify-center">
						{isFolder ? (
							node.isExpanded ? (
								<LuChevronDown className="size-3.5 text-muted-foreground" />
							) : (
								<LuChevronRight className="size-3.5 text-muted-foreground" />
							)
						) : null}
					</span>

					<FileIcon
						className="size-4 shrink-0"
						fileName={node.name}
						isDirectory={isFolder}
						isOpen={node.isExpanded}
					/>

					<span
						className={cn("min-w-0 flex-1 truncate text-xs", nameColorClass)}
					>
						{node.name}
					</span>

					{decoration && !isMuted && (
						<span
							className={cn(
								"ml-auto shrink-0 text-[10px] font-semibold leading-none",
								STATUS_TEXT_CLASS[decoration],
							)}
						>
							{isFolder ? (
								<LuCircle className="size-2 fill-current opacity-50" />
							) : (
								STATUS_LETTER[decoration]
							)}
						</span>
					)}
				</button>
			</ContextMenuTrigger>
			{isFolder ? (
				<FolderContextMenu
					absolutePath={node.absolutePath}
					relativePath={node.relativePath}
					onNewFile={() => onNewFile(node.absolutePath)}
					onNewFolder={() => onNewFolder(node.absolutePath)}
					onRename={() => onRename(node.absolutePath, node.name, true)}
					onDelete={() => onDelete(node.absolutePath, node.name, true)}
				/>
			) : (
				<FileContextMenu
					absolutePath={node.absolutePath}
					relativePath={node.relativePath}
					onRename={() => onRename(node.absolutePath, node.name, false)}
					onDelete={() => onDelete(node.absolutePath, node.name, false)}
				/>
			)}
		</ContextMenu>
	);
}

export const WorkspaceFilesTreeItem = memo(WorkspaceFilesTreeItemComponent);
