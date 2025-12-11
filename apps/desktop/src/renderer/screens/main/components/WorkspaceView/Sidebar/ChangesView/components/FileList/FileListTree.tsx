import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import type { ChangedFile } from "shared/changes-types";

interface FileListTreeProps {
	files: ChangedFile[];
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile) => void;
	showStats?: boolean;
}

interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	path: string;
	file?: ChangedFile;
	children?: FileTreeNode[];
}

function getStatusColor(status: string): string {
	switch (status) {
		case "added":
			return "text-green-600 dark:text-green-400";
		case "modified":
			return "text-yellow-600 dark:text-yellow-400";
		case "deleted":
			return "text-red-600 dark:text-red-400";
		case "renamed":
			return "text-blue-600 dark:text-blue-400";
		case "copied":
			return "text-purple-600 dark:text-purple-400";
		case "untracked":
			return "text-muted-foreground";
		default:
			return "text-muted-foreground";
	}
}

function getStatusIndicator(status: string): string {
	switch (status) {
		case "added":
			return "A";
		case "modified":
			return "M";
		case "deleted":
			return "D";
		case "renamed":
			return "R";
		case "copied":
			return "C";
		case "untracked":
			return "?";
		default:
			return "";
	}
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
}

function LevelIndicators({ level }: { level: number }) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0">
			{Array.from({ length: level }).map((_, i) => (
				<div
					key={i}
					className="w-3 self-stretch border-r border-border"
				/>
			))}
		</div>
	);
}

function TreeNodeComponent({
	node,
	level = 0,
	selectedPath,
	selectedCommitHash,
	onFileSelect,
	showStats,
}: TreeNodeComponentProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = node.children && node.children.length > 0;
	const isFile = node.type === "file";
	const isSelected = selectedPath === node.path && !selectedCommitHash;

	const statusColor = node.file?.status ? getStatusColor(node.file.status) : "";
	const statusIndicator = node.file?.status
		? getStatusIndicator(node.file.status)
		: "";

	if (hasChildren) {
		return (
			<Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="min-w-0">
				<CollapsibleTrigger
					className={cn(
						"w-full flex items-stretch gap-1.5 px-2 hover:bg-accent/50 cursor-pointer rounded-sm text-left overflow-hidden",
					)}
				>
					<LevelIndicators level={level} />
					<div className="flex items-center gap-1.5 py-1 flex-1 min-w-0">
						{isExpanded ? (
							<HiChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
						) : (
							<HiChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
						)}
						<span className="text-sm text-foreground flex-1 min-w-0 truncate">
							{node.name}
						</span>
					</div>
				</CollapsibleTrigger>
				<CollapsibleContent className="min-w-0">
					{node.children?.map((child) => (
						<TreeNodeComponent
							key={child.id}
							node={child}
							level={level + 1}
							selectedPath={selectedPath}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={onFileSelect}
							showStats={showStats}
						/>
					))}
				</CollapsibleContent>
			</Collapsible>
		);
	}

	return (
		<button
			type="button"
			className={cn(
				"w-full flex items-stretch gap-1.5 px-2 hover:bg-accent/70 cursor-pointer rounded-sm text-left overflow-hidden",
				isSelected && "bg-accent",
			)}
			onClick={() => isFile && node.file && onFileSelect(node.file)}
		>
			<LevelIndicators level={level} />
			<div className="flex items-center gap-1.5 py-1 flex-1 min-w-0">
				<span className="text-sm text-foreground flex-1 min-w-0 truncate">
					{node.name}
				</span>
				{showStats &&
					node.file &&
					(node.file.additions > 0 || node.file.deletions > 0) && (
						<div className="flex items-center gap-0.5 text-xs font-mono shrink-0 whitespace-nowrap">
							<span className="text-green-600 dark:text-green-400">+{node.file.additions}</span>
							<span className="text-red-600 dark:text-red-400">-{node.file.deletions}</span>
						</div>
					)}
				<span className={cn("text-xs font-mono shrink-0 whitespace-nowrap", statusColor)}>
					{statusIndicator}
				</span>
			</div>
		</button>
	);
}

export function FileListTree({
	files,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	showStats = true,
}: FileListTreeProps) {
	const tree = buildFileTree(files);

	return (
		<div className="flex flex-col min-w-0 overflow-hidden">
			{tree.map((node) => (
				<TreeNodeComponent
					key={node.id}
					node={node}
					selectedPath={selectedFile?.path ?? null}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onFileSelect}
					showStats={showStats}
				/>
			))}
		</div>
	);
}
