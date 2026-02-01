/**
 * File tree data model for the file explorer
 */
export interface FileTreeNode {
	/** Unique ID - relativePath from worktree root */
	id: string;
	/** Display name */
	name: string;
	/** Whether this is a directory */
	isDirectory: boolean;
	/** Absolute path on filesystem */
	path: string;
	/** Relative path from worktree root */
	relativePath: string;
	/** Children nodes - null means not loaded, empty array means empty dir */
	children?: FileTreeNode[] | null;
	/** Whether children are currently being loaded */
	isLoading?: boolean;
}

/**
 * File system change event from watcher
 */
export interface FileSystemChangeEvent {
	type: "add" | "addDir" | "unlink" | "unlinkDir" | "change";
	path: string;
	relativePath: string;
}

/**
 * Directory entry returned from readDirectory
 */
export interface DirectoryEntry {
	id: string;
	name: string;
	path: string;
	relativePath: string;
	isDirectory: boolean;
}
