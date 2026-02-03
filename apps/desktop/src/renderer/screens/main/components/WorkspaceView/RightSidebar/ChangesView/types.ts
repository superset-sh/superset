export type ChangesViewMode = "grouped" | "tree";

export interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	path: string;
	status?: string;
	additions?: number;
	deletions?: number;
	oldPath?: string;
	category?: string;
	children?: FileTreeNode[];
}
