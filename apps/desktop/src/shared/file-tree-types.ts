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
	type: "add" | "addDir" | "unlink" | "unlinkDir" | "change";
	path: string;
	relativePath: string;
}

export interface DirectoryEntry {
	id: string;
	name: string;
	path: string;
	relativePath: string;
	isDirectory: boolean;
}
