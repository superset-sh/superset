import { FileNode } from "../FileNode";
import { FolderNode } from "../FolderNode";
import { useFileTree } from "../../hooks/useFileTree";
import type { FileTreeNode, FileTreeProps } from "../../types";

interface TreeNodeRendererProps {
	node: FileTreeNode;
	depth: number;
	onFileClick: (path: string) => void;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
}

function TreeNodeRenderer({
	node,
	depth,
	onFileClick,
	expandedFolders,
	onToggleFolder,
}: TreeNodeRendererProps) {
	if (!node.isFolder && node.file) {
		return (
			<FileNode
				file={node.file}
				depth={depth}
				onClick={() => onFileClick(node.path)}
			/>
		);
	}

	if (node.isFolder && node.children) {
		const isExpanded = expandedFolders.has(node.path);

		// Root node - render children directly without folder UI
		if (node.path === "") {
			return (
				<>
					{node.children.map((child) => (
						<TreeNodeRenderer
							key={child.path}
							node={child}
							depth={0}
							onFileClick={onFileClick}
							expandedFolders={expandedFolders}
							onToggleFolder={onToggleFolder}
						/>
					))}
				</>
			);
		}

		return (
			<FolderNode
				node={node}
				depth={depth}
				isExpanded={isExpanded}
				onToggle={() => onToggleFolder(node.path)}
			>
				{node.children.map((child) => (
					<TreeNodeRenderer
						key={child.path}
						node={child}
						depth={depth + 1}
						onFileClick={onFileClick}
						expandedFolders={expandedFolders}
						onToggleFolder={onToggleFolder}
					/>
				))}
			</FolderNode>
		);
	}

	return null;
}

export function FileTree({
	files,
	onFileClick,
	expandedFolders,
	onToggleFolder,
}: FileTreeProps) {
	const tree = useFileTree(files);

	if (files.length === 0) {
		return null;
	}

	return (
		<div className="space-y-0.5">
			<TreeNodeRenderer
				node={tree}
				depth={0}
				onFileClick={onFileClick}
				expandedFolders={expandedFolders}
				onToggleFolder={onToggleFolder}
			/>
		</div>
	);
}
