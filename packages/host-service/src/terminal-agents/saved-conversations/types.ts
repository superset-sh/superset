export type SavedConversationProvider = "claude" | "codex";

export interface NativeConversationReference {
	provider: SavedConversationProvider;
	/** Claude session UUID or Codex thread UUID, never an app's chat ID. */
	sessionId: string;
	/** The caller must resolve symlinks before supplying paths. */
	cwd: string;
	/** A source-selected Claude branch position; must be the final message. */
	headUuid?: string;
}

export interface TranscriptSnapshot {
	canonicalPath: string;
	/** Complete, strictly decoded UTF-8 JSONL from one stable file read. */
	content: string;
	complete: boolean;
}

export interface NativeConversationEvidence {
	reference: NativeConversationReference;
	transcriptPath: string;
	sha256: string;
	bytes: number;
	records: number;
	/** Record count, not a reconstructed conversation or active-branch count. */
	messageRecords: number;
}

export type SavedConversationIssue =
	| "invalid_reference"
	| "missing_transcript"
	| "ambiguous_transcript"
	| "incomplete_transcript"
	| "transcript_too_large"
	| "invalid_record"
	| "session_mismatch"
	| "missing_session"
	| "cwd_mismatch"
	| "missing_cwd"
	| "subagent_transcript"
	| "empty_conversation"
	| "head_mismatch";

export type SavedConversationResult<T> =
	| { ok: true; value: T }
	| { ok: false; issue: SavedConversationIssue };
