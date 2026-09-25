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
	/**
	 * Absent when the watcher could not determine the path's type — its stat
	 * lost a race with whatever changed the path again. `false` is a positive
	 * assertion that the path is not a directory; absent is "no answer", and
	 * consumers that need one should fall back to what they already know
	 * about the path rather than reading it as a file.
	 */
	isDirectory?: boolean;
};
