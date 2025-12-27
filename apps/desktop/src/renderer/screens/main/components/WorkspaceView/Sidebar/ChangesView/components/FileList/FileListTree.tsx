import { useState } from "react";
import type { ChangedFile } from "shared/changes-types";
import { FileItem } from "../FileItem";
import { FolderRow } from "../FolderRow";

interface FileListTreeProps {
	files: ChangedFile[];
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile) => void;
	showStats?: boolean;
	onStage?: (file: ChangedFile) => void;
	onUnstage?: (file: ChangedFile) => void;
	isActioning?: boolean;
}

interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	path: string;
	file?: ChangedFile;
	children?: FileTreeNode[];
}

function buildFileTree(files: ChangedFile[]): FileTreeNode[] {
	type TreeNodeInternal = Omit<FileTreeNode, "children"> & {
		children?: Record<string, TreeNodeInternal>;
	};

	const root: Record<string, TreeNodeInternal> = {};

	for (const file of files) {
		const parts = file.path.split("/");
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			const pathSoFar = parts.slice(0, i + 1).join("/");

			if (!current[part]) {
				current[part] = {
					id: pathSoFar,
					name: part,
					type: isLast ? "file" : "folder",
					path: pathSoFar,
					file: isLast ? file : undefined,
					children: isLast ? undefined : {},
				};
			}

			if (!isLast && current[part].children) {
				current = current[part].children;
			}
		}
	}

	function convertToArray(
		nodes: Record<string, TreeNodeInternal>,
	): FileTreeNode[] {
		return Object.values(nodes)
			.map((node) => ({
				...node,
				children: node.children ? convertToArray(node.children) : undefined,
			}))
			.sort((a, b) => {
				if (a.type !== b.type) {
					return a.type === "folder" ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
	}

	return convertToArray(root);
}

interface TreeNodeComponentProps {
	node: FileTreeNode;
	level?: number;
	selectedPath: string | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile) => void;
	showStats?: boolean;
	onStage?: (file: ChangedFile) => void;
	onUnstage?: (file: ChangedFile) => void;
	isActioning?: boolean;
}

function TreeNodeComponent({
	node,
	level = 0,
	selectedPath,
	selectedCommitHash,
	onFileSelect,
	showStats,
	onStage,
	onUnstage,
	isActioning,
}: TreeNodeComponentProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = node.children && node.children.length > 0;
	const isFile = node.type === "file";
	const isSelected = selectedPath === node.path && !selectedCommitHash;

	if (hasChildren) {
		return (
			<FolderRow
				name={node.name}
				isExpanded={isExpanded}
				onToggle={setIsExpanded}
				level={level}
				variant="tree"
			>
				{node.children?.map((child) => (
					<TreeNodeComponent
						key={child.id}
						node={child}
						level={level + 1}
						selectedPath={selectedPath}
						selectedCommitHash={selectedCommitHash}
						onFileSelect={onFileSelect}
						showStats={showStats}
						onStage={onStage}
						onUnstage={onUnstage}
						isActioning={isActioning}
					/>
				))}
			</FolderRow>
		);
	}

	if (isFile && node.file) {
		const file = node.file;
		return (
			<FileItem
				file={file}
				isSelected={isSelected}
				onClick={() => onFileSelect(file)}
				showStats={showStats}
				level={level}
				onStage={onStage ? () => onStage(file) : undefined}
				onUnstage={onUnstage ? () => onUnstage(file) : undefined}
				isActioning={isActioning}
			/>
		);
	}

	return null;
}

export function FileListTree({
	files,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	showStats = true,
	onStage,
	onUnstage,
	isActioning,
}: FileListTreeProps) {
	const tree = buildFileTree(files);

	return (
		<div className="flex flex-col overflow-hidden">
			{tree.map((node) => (
				<TreeNodeComponent
					key={node.id}
					node={node}
					selectedPath={selectedFile?.path ?? null}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onFileSelect}
					showStats={showStats}
					onStage={onStage}
					onUnstage={onUnstage}
					isActioning={isActioning}
				/>
			))}
		</div>
	);
}
