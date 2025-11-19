import {
	ChevronDown,
	ChevronRight,
	File,
	Folder,
	FolderOpen,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { FileDiff } from "./types";

interface FileNode {
	name: string;
	path: string;
	type: "file" | "folder";
	children?: FileNode[];
	file?: FileDiff;
}

interface FileTreeProps {
	files: FileDiff[];
	selectedFile: string | null;
	onFileSelect: (fileId: string) => void;
	getFileIcon: (status: FileDiff["status"]) => React.ReactNode;
}

// Build hierarchical tree from flat file list
function buildFileTree(files: FileDiff[]): FileNode[] {
	const root: FileNode[] = [];
	const folderMap = new Map<string, FileNode>();

	// Sort files by path for consistent tree structure
	const sortedFiles = [...files].sort((a, b) =>
		a.filePath.localeCompare(b.filePath),
	);

	for (const file of sortedFiles) {
		const parts = file.filePath.split("/");
		let currentLevel = root;
		let currentPath = "";

		// Create folders
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			let folder = currentLevel.find(
				(node) => node.name === part && node.type === "folder",
			);

			if (!folder) {
				folder = {
					name: part,
					path: currentPath,
					type: "folder",
					children: [],
				};
				currentLevel.push(folder);
				folderMap.set(currentPath, folder);
			}

			currentLevel = folder.children!;
		}

		// Add file
		currentLevel.push({
			name: file.fileName,
			path: file.filePath,
			type: "file",
			file,
		});
	}

	return root;
}

// Check if a folder node contains any files (recursively)
function hasFiles(node: FileNode): boolean {
	if (node.type === "file") return true;
	if (!node.children) return false;
	return node.children.some((child) => hasFiles(child));
}

const TreeNode = memo(function TreeNode({
	node,
	selectedFile,
	onFileSelect,
	getFileIcon,
	level = 0,
}: {
	node: FileNode;
	selectedFile: string | null;
	onFileSelect: (fileId: string) => void;
	getFileIcon: (status: FileDiff["status"]) => React.ReactNode;
	level?: number;
}) {
	// Start expanded if folder contains any files (changed files)
	const [isExpanded, setIsExpanded] = useState(
		node.type === "folder" ? hasFiles(node) : false,
	);

	if (node.type === "folder") {
		return (
			<div>
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-all duration-150 hover:bg-white/5 text-zinc-300"
					style={{ paddingLeft: `${level * 12 + 8}px` }}
					type="button"
				>
					{isExpanded ? (
						<ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
					) : (
						<ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
					)}
					{isExpanded ? (
						<FolderOpen className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
					) : (
						<Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
					)}
					<span className="text-xs font-medium truncate">{node.name}</span>
				</button>
				{isExpanded && node.children && (
					<div>
						{node.children.map((child) => (
							<TreeNode
								key={child.path}
								node={child}
								selectedFile={selectedFile}
								onFileSelect={onFileSelect}
								getFileIcon={getFileIcon}
								level={level + 1}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	// File node
	const file = node.file!;
	const isSelected = selectedFile === file.id;

	return (
		<button
			onClick={() => onFileSelect(file.id)}
			className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-all duration-150 ${
				isSelected
					? "bg-white/8 text-zinc-100"
					: "hover:bg-white/5 text-zinc-300"
			}`}
			style={{ paddingLeft: `${level * 12 + 20}px` }}
			type="button"
		>
			{getFileIcon(file.status)}
			<span className="flex-1 text-xs font-medium truncate">{node.name}</span>
			<div className="flex items-center gap-1.5 shrink-0 text-[10px]">
				{file.additions > 0 && (
					<span className="text-emerald-400">+{file.additions}</span>
				)}
				{file.deletions > 0 && (
					<span className="text-rose-400">-{file.deletions}</span>
				)}
			</div>
		</button>
	);
});

export const FileTree = memo(function FileTree({
	files,
	selectedFile,
	onFileSelect,
	getFileIcon,
}: FileTreeProps) {
	const tree = useMemo(() => buildFileTree(files), [files]);

	return (
		<div className="space-y-0.5">
			{tree.map((node) => (
				<TreeNode
					key={node.path}
					node={node}
					selectedFile={selectedFile}
					onFileSelect={onFileSelect}
					getFileIcon={getFileIcon}
				/>
			))}
		</div>
	);
});
