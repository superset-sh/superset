import { createHash } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import type {
	NativeConversationEvidence,
	NativeConversationReference,
	SavedConversationResult,
	TranscriptSnapshot,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const MAX_RECORDS = 100_000;

function isNativeSessionId(value: unknown): value is string {
	return typeof value === "string" && UUID.test(value);
}

function hasControlCharacters(value: string): boolean {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) return true;
	}
	return false;
}

function isCanonicalPathInput(value: unknown): value is string {
	return (
		typeof value === "string" &&
		isAbsolute(value) &&
		!hasControlCharacters(value) &&
		normalize(value) === value
	);
}

function object(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function isCodexChild(payload: Record<string, unknown>): boolean {
	const source = object(payload.source);
	return (
		payload.parent_thread_id != null ||
		payload.source === "subagent" ||
		payload.source === "internal" ||
		(source !== null && ("subagent" in source || "internal" in source))
	);
}

/**
 * Identity evidence only. The caller must independently check store ownership,
 * stable file reads, writers and launch-time identity; this never grants resume.
 * Candidate paths must come from a complete search, deduplicated by realpath.
 */
export function validateNativeConversation(
	reference: NativeConversationReference,
	snapshots: readonly TranscriptSnapshot[],
): SavedConversationResult<NativeConversationEvidence> {
	if (
		(reference.provider !== "claude" && reference.provider !== "codex") ||
		!isNativeSessionId(reference.sessionId) ||
		!isCanonicalPathInput(reference.cwd) ||
		(reference.headUuid !== undefined &&
			(reference.provider !== "claude" ||
				!isNativeSessionId(reference.headUuid)))
	) {
		return { ok: false, issue: "invalid_reference" };
	}
	if (snapshots.length === 0) return { ok: false, issue: "missing_transcript" };
	// Even matching bytes at two paths do not establish the provider's lookup.
	if (snapshots.length !== 1)
		return { ok: false, issue: "ambiguous_transcript" };
	const snapshot = snapshots[0];
	if (!snapshot || !isCanonicalPathInput(snapshot.canonicalPath))
		return { ok: false, issue: "invalid_reference" };
	if (snapshot.complete !== true)
		return { ok: false, issue: "incomplete_transcript" };
	const bytes = Buffer.byteLength(snapshot.content, "utf8");
	if (bytes > MAX_TRANSCRIPT_BYTES)
		return { ok: false, issue: "transcript_too_large" };
	let records = 0;
	let messageRecords = 0;
	let foundSession = false;
	let foundCwd = false;
	let lastMessageUuid: unknown = null;
	let lastMessageType: unknown = null;
	let codexMetadataCount = 0;
	for (const line of snapshot.content.split("\n")) {
		if (!line.trim()) continue;
		if (++records > MAX_RECORDS || Buffer.byteLength(line) > MAX_RECORD_BYTES)
			return { ok: false, issue: "transcript_too_large" };
		let event: Record<string, unknown> | null;
		try {
			event = object(JSON.parse(line));
		} catch {
			return { ok: false, issue: "invalid_record" };
		}
		if (!event || typeof event.type !== "string")
			return { ok: false, issue: "invalid_record" };
		let cwd: unknown;
		if (reference.provider === "claude") {
			if (
				event.sessionId !== undefined &&
				event.sessionId !== reference.sessionId
			)
				return { ok: false, issue: "session_mismatch" };
			if (event.sessionId === reference.sessionId) {
				foundSession = true;
				cwd = event.cwd;
			}
			if (event.type === "user" || event.type === "assistant") {
				if (event.sessionId !== reference.sessionId)
					return { ok: false, issue: "session_mismatch" };
				if (event.isSidechain === true || event.teamName != null)
					return { ok: false, issue: "subagent_transcript" };
				if (!object(event.message) || !isNativeSessionId(event.uuid))
					return { ok: false, issue: "invalid_record" };
				messageRecords++;
				lastMessageUuid = event.uuid;
				lastMessageType = event.type;
			}
		} else {
			if (event.type === "session_meta") {
				const payload = object(event.payload);
				if (!payload || ++codexMetadataCount !== 1 || records !== 1)
					return { ok: false, issue: "invalid_record" };
				// session_id may identify a root thread. Only id is resumable here.
				if (payload.id !== reference.sessionId)
					return { ok: false, issue: "session_mismatch" };
				if (isCodexChild(payload))
					return { ok: false, issue: "subagent_transcript" };
				foundSession = true;
				cwd = payload.cwd;
			}
			const item =
				event.type === "response_item" ? object(event.payload) : event;
			if (
				item?.type === "message" &&
				(item.role === "user" || item.role === "assistant")
			) {
				if (!Array.isArray(item.content))
					return { ok: false, issue: "invalid_record" };
				messageRecords++;
			}
		}
		if (cwd !== undefined) {
			if (!isCanonicalPathInput(cwd) || cwd !== reference.cwd)
				return { ok: false, issue: "cwd_mismatch" };
			foundCwd = true;
		}
	}
	if (!foundSession) return { ok: false, issue: "missing_session" };
	if (!foundCwd) return { ok: false, issue: "missing_cwd" };
	if (!messageRecords) return { ok: false, issue: "empty_conversation" };
	if (
		reference.headUuid !== undefined &&
		(lastMessageUuid !== reference.headUuid || lastMessageType !== "assistant")
	)
		return { ok: false, issue: "head_mismatch" };
	return {
		ok: true,
		value: {
			reference: { ...reference },
			transcriptPath: snapshot.canonicalPath,
			sha256: createHash("sha256")
				.update(snapshot.content, "utf8")
				.digest("hex"),
			bytes,
			records,
			messageRecords,
		},
	};
}
