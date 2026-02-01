import type { NodeRendererProps } from "react-arborist";
import type { FileTreeNode } from "shared/file-tree-types";

/**
 * Props for the FileTreeNode component (react-arborist node renderer)
 */
export type FileTreeNodeProps = NodeRendererProps<FileTreeNode>;

/**
 * Callback for when a file is selected/opened
 */
export type OnFileOpen = (node: FileTreeNode) => void;

/**
 * Mode for creating new items
 */
export type NewItemMode = "file" | "folder" | null;

/**
 * Tree action result type
 */
export interface TreeActionResult {
	success: boolean;
	error?: string;
}
