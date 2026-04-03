import { cn } from "@superset/ui/utils";
import type { FileTreeNode } from "@superset/workspace-client";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

interface WorkspaceFilesTreeItemProps {
	node: FileTreeNode;
	depth: number;
	rowHeight: number;
	indent: number;
	selectedFilePath?: string;
	onSelectFile: (absolutePath: string) => void;
	onToggleDirectory: (absolutePath: string) => void;
}

export function WorkspaceFilesTreeItem({
	node,
	depth,
	rowHeight,
	indent,
	selectedFilePath,
	onSelectFile,
	onToggleDirectory,
}: WorkspaceFilesTreeItemProps) {
	const isFolder = node.kind === "directory";
	const isSelected = selectedFilePath === node.absolutePath;

	return (
		<button
			data-filepath={node.absolutePath}
			aria-expanded={isFolder ? node.isExpanded : undefined}
			className={cn(
				"flex w-full cursor-pointer select-none items-center gap-1 px-1 text-left transition-colors hover:bg-accent/50",
				isSelected && "bg-accent",
			)}
			onClick={() =>
				isFolder
					? onToggleDirectory(node.absolutePath)
					: onSelectFile(node.absolutePath)
			}
			style={{
				height: rowHeight,
				paddingLeft: depth * indent,
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
	);
}
