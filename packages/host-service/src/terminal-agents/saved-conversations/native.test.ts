import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { validateNativeConversation } from "./native";
import type { NativeConversationReference, TranscriptSnapshot } from "./types";

const SESSION = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const HEAD = "44444444-4444-4444-8444-444444444444";
const CWD = "/work/project";
const reference: NativeConversationReference = {
	provider: "claude",
	sessionId: SESSION,
	cwd: CWD,
};

function claude(overrides: Record<string, unknown> = {}) {
	return {
		type: "assistant",
		sessionId: SESSION,
		cwd: CWD,
		uuid: HEAD,
		parentUuid: USER,
		message: { role: "assistant", content: "Saved response" },
		...overrides,
	};
}

function snapshot(...records: unknown[]): TranscriptSnapshot {
	return {
		canonicalPath: `/profiles/a/projects/project/${SESSION}.jsonl`,
		content: records.map((r) => JSON.stringify(r)).join("\n"),
		complete: true,
	};
}

function codexMeta(overrides: Record<string, unknown> = {}) {
	return {
		type: "session_meta",
		payload: { id: SESSION, cwd: CWD, source: "cli", ...overrides },
	};
}
const codexMessage = {
	type: "response_item",
	payload: {
		type: "message",
		role: "assistant",
		content: [{ type: "output_text", text: "Saved response" }],
	},
};
const codexReference = { ...reference, provider: "codex" } as const;

describe("saved native conversation identity", () => {
	test("validates complete Claude records without exposing conversation text", () => {
		const file = snapshot(
			claude({ type: "user", uuid: USER, parentUuid: null }),
			claude(),
		);
		const result = validateNativeConversation(reference, [file]);
		expect(result).toEqual({
			ok: true,
			value: {
				reference,
				transcriptPath: file.canonicalPath,
				sha256: createHash("sha256").update(file.content).digest("hex"),
				bytes: Buffer.byteLength(file.content),
				records: 2,
				messageRecords: 2,
			},
		});
		expect(JSON.stringify(result)).not.toContain("Saved response");
	});

	test("keeps two conversations in the same folder separate", () => {
		const first = validateNativeConversation(reference, [snapshot(claude())]);
		const second = validateNativeConversation(
			{ ...reference, sessionId: OTHER },
			[snapshot(claude({ sessionId: OTHER }))],
		);
		expect(first.ok && second.ok).toBe(true);
		if (first.ok && second.ok)
			expect(first.value.reference.sessionId).not.toBe(
				second.value.reference.sessionId,
			);
	});

	test("does not select among duplicate stores even when their bytes match", () => {
		const file = snapshot(claude());
		expect(
			validateNativeConversation(reference, [
				file,
				{ ...file, canonicalPath: "/profiles/b/copy.jsonl" },
			]),
		).toEqual({ ok: false, issue: "ambiguous_transcript" });
	});

	test("requires a complete snapshot and a present transcript", () => {
		expect(validateNativeConversation(reference, [])).toEqual({
			ok: false,
			issue: "missing_transcript",
		});
		expect(
			validateNativeConversation(reference, [
				{ ...snapshot(claude()), complete: false },
			]),
		).toEqual({ ok: false, issue: "incomplete_transcript" });
	});

	test.each([
		"../session",
		"last",
		"",
		`${SESSION}\n`,
	])("refuses non-native identity %j", (sessionId) => {
		expect(
			validateNativeConversation({ ...reference, sessionId }, [
				snapshot(claude()),
			]),
		).toEqual({ ok: false, issue: "invalid_reference" });
	});

	test.each([
		"relative/project",
		"/work/../project",
		"/work/\u0000project",
	])("refuses an unresolved working path %j", (cwd) => {
		expect(
			validateNativeConversation({ ...reference, cwd }, [snapshot(claude())]),
		).toEqual({ ok: false, issue: "invalid_reference" });
	});

	test("does not let an initial matching record hide a foreign identity", () => {
		expect(
			validateNativeConversation(reference, [
				snapshot(claude(), claude({ sessionId: OTHER })),
			]),
		).toEqual({ ok: false, issue: "session_mismatch" });
	});

	test("rejects messages with no ownership and metadata without messages", () => {
		expect(
			validateNativeConversation(reference, [
				snapshot(claude({ sessionId: undefined })),
			]),
		).toEqual({ ok: false, issue: "session_mismatch" });
		expect(
			validateNativeConversation(reference, [
				snapshot({ type: "queue-operation", sessionId: SESSION, cwd: CWD }),
			]),
		).toEqual({ ok: false, issue: "empty_conversation" });
	});

	test("checks working-folder evidence throughout the snapshot", () => {
		expect(
			validateNativeConversation(reference, [
				snapshot(claude(), claude({ cwd: "/work/other" })),
			]),
		).toEqual({ ok: false, issue: "cwd_mismatch" });
		expect(
			validateNativeConversation(reference, [
				snapshot(claude({ cwd: undefined })),
			]),
		).toEqual({ ok: false, issue: "missing_cwd" });
	});

	test.each([
		{ isSidechain: true },
		{ teamName: "worker" },
	])("does not import a Claude worker as an independent chat: %j", (overrides) => {
		expect(
			validateNativeConversation(reference, [snapshot(claude(overrides))]),
		).toEqual({ ok: false, issue: "subagent_transcript" });
	});

	test.each([
		"{",
		"null",
		"[]",
		'{"message":{}}',
	])("does not silently skip a malformed trailing record: %j", (tail) => {
		const file = snapshot(claude());
		expect(
			validateNativeConversation(reference, [
				{ ...file, content: `${file.content}\n${tail}` },
			]),
		).toEqual({ ok: false, issue: "invalid_record" });
	});

	test("requires a selected Claude head to be the last assistant record", () => {
		const pinned = { ...reference, headUuid: HEAD };
		expect(validateNativeConversation(pinned, [snapshot(claude())]).ok).toBe(
			true,
		);
		for (const later of [
			claude({ uuid: OTHER }),
			claude({ type: "user", uuid: HEAD }),
		]) {
			expect(
				validateNativeConversation(pinned, [snapshot(claude(), later)]),
			).toEqual({ ok: false, issue: "head_mismatch" });
		}
	});

	test("Codex resumes the thread id, not session_id, title or creator account", () => {
		const file = snapshot(
			codexMeta({ session_id: OTHER, creator_account_id: "unrelated-account" }),
			codexMessage,
		);
		expect(validateNativeConversation(codexReference, [file]).ok).toBe(true);
		expect(
			validateNativeConversation({ ...codexReference, sessionId: OTHER }, [
				file,
			]),
		).toEqual({ ok: false, issue: "session_mismatch" });
	});

	test("supports old bare Codex message records without inventing identity", () => {
		expect(
			validateNativeConversation(codexReference, [
				snapshot(codexMeta(), codexMessage.payload),
			]).ok,
		).toBe(true);
		expect(
			validateNativeConversation(codexReference, [
				snapshot(codexMessage.payload),
			]),
		).toEqual({ ok: false, issue: "missing_session" });
	});

	test("rejects duplicated or displaced Codex metadata", () => {
		for (const records of [
			[codexMeta(), codexMeta({ id: OTHER }), codexMessage],
			[codexMessage, codexMeta()],
		]) {
			expect(
				validateNativeConversation(codexReference, [snapshot(...records)]),
			).toEqual({ ok: false, issue: "invalid_record" });
		}
	});

	test.each([
		{ parent_thread_id: OTHER },
		{ source: { subagent: { thread_spawn: { parent_thread_id: OTHER } } } },
		{ source: { internal: "memory_consolidation" } },
	])("does not promote a Codex worker to an independent chat: %j", (extra) => {
		expect(
			validateNativeConversation(codexReference, [
				snapshot(codexMeta(extra), codexMessage),
			]),
		).toEqual({ ok: false, issue: "subagent_transcript" });
	});

	test("requires Codex working folder evidence and rejects Claude head options", () => {
		expect(
			validateNativeConversation(codexReference, [
				snapshot(codexMeta({ cwd: "/work/other" }), codexMessage),
			]),
		).toEqual({ ok: false, issue: "cwd_mismatch" });
		expect(
			validateNativeConversation({ ...codexReference, headUuid: HEAD }, [
				snapshot(codexMeta(), codexMessage),
			]),
		).toEqual({ ok: false, issue: "invalid_reference" });
	});
});
