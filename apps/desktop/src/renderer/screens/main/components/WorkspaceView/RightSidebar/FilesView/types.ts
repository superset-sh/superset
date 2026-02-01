import type { NodeRendererProps } from "react-arborist";
import type { FileTreeNode } from "shared/file-tree-types";

export type FileTreeNodeProps = NodeRendererProps<FileTreeNode>;

export type OnFileOpen = (node: FileTreeNode) => void;

export type NewItemMode = "file" | "folder" | null;

export interface TreeActionResult {
	success: boolean;
	error?: string;
}
