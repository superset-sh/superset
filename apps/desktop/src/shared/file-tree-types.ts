export interface FileSystemChangeEvent {
	type: "add" | "addDir" | "unlink" | "unlinkDir" | "change";
	path: string;
	relativePath: string;
}

export interface FileSystemBatchEvent {
	workspaceId: string;
	events: FileSystemChangeEvent[];
	timestamp: number;
}

export interface DirectoryEntry {
	id: string;
	name: string;
	path: string;
	relativePath: string;
	isDirectory: boolean;
}
