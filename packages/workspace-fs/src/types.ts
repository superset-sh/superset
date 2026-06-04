export type FsEntryKind = "file" | "directory" | "symlink" | "other";

export interface FsEntry {
	absolutePath: string;
	name: string;
	kind: FsEntryKind;
}

export type FsReadResult =
	| {
			kind: "text";
			content: string;
			byteLength: number;
			exceededLimit: boolean;
			revision: string;
	  }
	| {
			kind: "bytes";
			content: Uint8Array;
			byteLength: number;
			exceededLimit: boolean;
			revision: string;
	  };

export type FsWriteResult =
	| { ok: true; revision: string }
	| { ok: false; reason: "conflict"; currentRevision: string }
	| { ok: false; reason: "exists" }
	| { ok: false; reason: "not-found" };

export interface FsMetadata {
	absolutePath: string;
	kind: FsEntryKind;
	size: number | null;
	createdAt: string | null;
	modifiedAt: string | null;
	accessedAt: string | null;
	mode?: number | null;
	permissions?: string | null;
	owner?: string | null;
	group?: string | null;
	symlinkTarget?: string | null;
	revision: string;
}

export interface FsSearchMatch {
	absolutePath: string;
	relativePath: string;
	name: string;
	kind: FsEntryKind;
	score: number;
}

export interface FsContentMatch {
	absolutePath: string;
	relativePath: string;
	line: number;
	column: number;
	preview: string;
}

export type FsWatchEvent = {
	kind: "create" | "update" | "delete" | "rename" | "overflow";
	absolutePath: string;
	oldAbsolutePath?: string;
	isDirectory?: boolean;
};
