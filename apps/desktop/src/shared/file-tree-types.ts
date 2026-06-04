export interface FileTreeNode {
	id: string;
	name: string;
	isDirectory: boolean;
	path: string;
	relativePath: string;
	children?: FileTreeNode[] | null;
	isLoading?: boolean;
}

export interface FileSystemChangeEvent {
	type: "create" | "update" | "delete" | "rename" | "overflow";
	absolutePath?: string;
	oldAbsolutePath?: string;
	relativePath?: string;
	oldRelativePath?: string;
	isDirectory?: boolean;
	revision: number;
}

export interface DirectoryEntry {
	id: string;
	name: string;
	path: string;
	relativePath: string;
	isDirectory: boolean;
}
