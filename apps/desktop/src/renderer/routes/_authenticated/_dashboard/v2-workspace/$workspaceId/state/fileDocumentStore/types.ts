export type ContentState =
	| { kind: "loading" }
	| { kind: "text"; value: string; revision: string }
	| { kind: "bytes"; value: Uint8Array; revision: string }
	| { kind: "not-found" }
	| { kind: "too-large" }
	| { kind: "is-directory" }
	| { kind: "error"; error: Error };

export type SaveResult =
	| { status: "saved"; revision: string }
	| { status: "conflict"; diskContent: string | null }
	| { status: "not-found" }
	| { status: "exists" }
	| { status: "error"; error: Error };

export type ConflictResolution = "reload" | "overwrite" | "keep";

export interface ConflictState {
	diskContent: string | null;
}

export interface SharedFileDocument {
	readonly id: string;
	readonly workspaceId: string;
	readonly absolutePath: string;

	readonly content: ContentState;
	readonly dirty: boolean;

	readonly pendingSave: boolean;
	readonly saveError: Error | null;
	readonly conflict: ConflictState | null;
	readonly orphaned: boolean;
	readonly hasExternalChange: boolean;

	readonly isBinary: boolean | null;
	readonly byteSize: number | null;

	setContent(next: string): void;
	save(opts?: { force?: boolean }): Promise<SaveResult>;
	reload(): Promise<void>;
	loadUnlimited(): Promise<void>;
	resolveConflict(choice: ConflictResolution): Promise<void>;
	clearSaveError(): void;

	subscribe(listener: () => void): () => void;
	getVersion(): number;
}
