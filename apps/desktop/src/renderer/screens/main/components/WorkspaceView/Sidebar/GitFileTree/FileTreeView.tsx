import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import type { FileTreeNode } from "./types";
import { getStatusColor, getStatusIndicator } from "./utils";

interface FileTreeViewProps {
	tree: FileTreeNode[];
	onFileSelect?: (file: FileTreeNode) => void;
}

interface TreeNodeProps {
	node: FileTreeNode;
	level?: number;
	onFileSelect?: (file: FileTreeNode) => void;
}

function TreeNode({ node, level = 0, onFileSelect }: TreeNodeProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = node.children && node.children.length > 0;
	const isFile = node.type === "file";

	const statusColor = node.status ? getStatusColor(node.status) : "";
	const statusIndicator = node.status ? getStatusIndicator(node.status) : "";

	if (hasChildren) {
		return (
			<Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
				<CollapsibleTrigger
					className={cn(
						"w-full flex items-center gap-1.5 px-2 py-1 hover:bg-accent/50 cursor-pointer rounded-sm group text-left",
					)}
					style={{ paddingLeft: `${level * 16 + 8}px` }}
				>
					{isExpanded ? (
						<HiChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
					) : (
						<HiChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
					)}
					<span className="text-sm text-foreground flex-1 truncate">
						{node.name}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					{node.children?.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							level={level + 1}
							onFileSelect={onFileSelect}
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
				"w-full flex items-center gap-1.5 px-2 py-1 hover:bg-accent/70 cursor-pointer rounded-sm group text-left",
			)}
			style={{ paddingLeft: `${level * 16 + 8}px` }}
			onClick={() => isFile && onFileSelect?.(node)}
		>
			<div className="w-4" />
			<span className="text-sm text-foreground flex-1 truncate">
				{node.name}
			</span>
			{statusIndicator && (
				<span className={`text-xs font-medium ${statusColor}`}>
					{statusIndicator}
				</span>
			)}
			{node.staged && (
				<span className="text-xs text-green-500 opacity-0 group-hover:opacity-100">
					●
				</span>
			)}
		</button>
	);
}

export function FileTreeView({ tree, onFileSelect }: FileTreeViewProps) {
	return (
		<div className="flex flex-col h-full overflow-auto">
			{tree.length === 0 ? (
				<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
					No files to display
				</div>
			) : (
				tree.map((node) => (
					<TreeNode key={node.id} node={node} onFileSelect={onFileSelect} />
				))
			)}
		</div>
	);
}
