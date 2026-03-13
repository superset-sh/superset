export interface WorkspaceFsEntry {
	id: string;
	name: string;
	absolutePath: string;
	relativePath: string;
	isDirectory: boolean;
}

export interface WorkspaceFsSearchResult extends WorkspaceFsEntry {
	score: number;
}

export interface WorkspaceFsExistsResult {
	exists: boolean;
	isDirectory: boolean;
	isFile: boolean;
}

export interface WorkspaceFsStat {
	size: number;
	isDirectory: boolean;
	isFile: boolean;
	isSymbolicLink: boolean;
	createdAt: string;
	modifiedAt: string;
	accessedAt: string;
}

export interface WorkspaceFsLimitedReadResult {
	buffer: Uint8Array;
	exceededLimit: boolean;
}

export type WorkspaceFsGuardedWriteResult =
	| { status: "saved" }
	| { status: "conflict"; currentContent: string | null };

export interface WorkspaceFsPathOperationError {
	absolutePath: string;
	error: string;
}

export interface DeletePathsResult {
	deleted: string[];
	errors: WorkspaceFsPathOperationError[];
}

export interface MoveCopyResult {
	entries: { from: string; to: string }[];
	errors: WorkspaceFsPathOperationError[];
}

export interface WorkspaceFsKeywordMatch extends WorkspaceFsEntry {
	line: number;
	column: number;
	preview: string;
}

export type WorkspaceFsWatchEvent =
	| {
			type: "create" | "update" | "delete";
			workspaceId: string;
			absolutePath: string;
			isDirectory: boolean;
			revision: number;
	  }
	| {
			type: "rename";
			workspaceId: string;
			oldAbsolutePath: string;
			absolutePath: string;
			isDirectory: boolean;
			revision: number;
	  }
	| {
			type: "overflow";
			workspaceId: string;
			revision: number;
	  };
