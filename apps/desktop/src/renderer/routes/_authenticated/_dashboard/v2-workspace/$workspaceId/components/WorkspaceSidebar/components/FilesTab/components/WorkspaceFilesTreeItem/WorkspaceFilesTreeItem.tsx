import { ContextMenu, ContextMenuTrigger } from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { FileTreeNode } from "renderer/hooks/host-service/useFileTree";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

import { FileContextMenu } from "./components/FileContextMenu";
import { FolderContextMenu } from "./components/FolderContextMenu";

interface WorkspaceFilesTreeItemProps {
	node: FileTreeNode;
	depth: number;
	rowHeight: number;
	indent: number;
	selectedFilePath?: string;
	isHovered?: boolean;
	onSelectFile: (absolutePath: string) => void;
	onToggleDirectory: (absolutePath: string) => void;
	onNewFile: (parentPath: string) => void;
	onNewFolder: (parentPath: string) => void;
	onRename: (absolutePath: string, name: string, isDirectory: boolean) => void;
	onDelete: (absolutePath: string, name: string, isDirectory: boolean) => void;
}

export function WorkspaceFilesTreeItem({
	node,
	depth,
	rowHeight,
	indent,
	selectedFilePath,
	isHovered,
	onSelectFile,
	onToggleDirectory,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: WorkspaceFilesTreeItemProps) {
	const isFolder = node.kind === "directory";
	const isSelected = selectedFilePath === node.absolutePath;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					data-filepath={node.absolutePath}
					aria-expanded={isFolder ? node.isExpanded : undefined}
					className={cn(
						"flex w-full cursor-pointer select-none items-center gap-1 pr-2 text-left transition-colors",
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
						paddingLeft: 4 + depth * indent,
						...(isFolder
							? {
									position: "sticky" as const,
									top: depth * rowHeight,
									zIndex: 10 - depth,
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

					<span className="min-w-0 flex-1 truncate text-xs">{node.name}</span>
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
