export type GitFileStatus =
	| "added"
	| "modified"
	| "deleted"
	| "renamed"
	| "untracked";

export interface GitFile {
	id: string;
	path: string;
	name: string;
	status: GitFileStatus;
	oldPath?: string; // For renamed files
	staged: boolean;
}

export type ViewMode = "tree" | "grouped";

export interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	path: string;
	status?: GitFileStatus;
	staged?: boolean;
	oldPath?: string;
	children?: FileTreeNode[];
}

export interface FolderGroup {
	folderPath: string;
	folderName: string;
	files: GitFile[];
}
