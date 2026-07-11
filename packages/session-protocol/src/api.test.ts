import { describe, expect, test } from "bun:test";
import {
	createSessionInput,
	decodeMessagesCursor,
	encodeMessagesCursor,
	getMessagesInput,
	listSessionsInput,
	respondToPermissionInput,
	retrySessionInput,
	sendMessageInput,
	setPermissionModeInput,
} from "./api";
import { sessionEventEnvelopeSchema } from "./events";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

describe("message cursors", () => {
	test("round-trips safe offsets through an opaque, versioned cursor", () => {
		for (const offset of [0, 1, 35, 36, 50_000, Number.MAX_SAFE_INTEGER]) {
			const cursor = encodeMessagesCursor(offset);
			expect(cursor.startsWith("m1_")).toBe(true);
			expect(decodeMessagesCursor(cursor)).toBe(offset);
		}
	});

	test("rejects malformed and non-canonical cursors", () => {
		for (const cursor of ["", "1", "m1_", "m1_-1", "m1_00", "m2_1", "m1_!"]) {
			expect(decodeMessagesCursor(cursor)).toBeNull();
		}
		expect(() => encodeMessagesCursor(-1)).toThrow();
		expect(() => encodeMessagesCursor(1.5)).toThrow();
	});
});

describe("router schemas", () => {
	test("pagination defaults to 50 and caps at 200", () => {
		expect(listSessionsInput.parse({}).limit).toBe(50);
		expect(getMessagesInput.parse({ sessionId: SESSION_ID }).limit).toBe(50);
		expect(listSessionsInput.safeParse({ limit: 201 }).success).toBe(false);
	});

	test("create and control inputs use SDK model/mode vocabulary", () => {
		expect(
			createSessionInput.parse({
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
				model: "claude-opus-4-6",
				permissionMode: "plan",
				effort: "xhigh",
			}),
		).toMatchObject({ permissionMode: "plan", effort: "xhigh" });
		expect(
			setPermissionModeInput.safeParse({
				sessionId: SESSION_ID,
				permissionMode: "unrestricted",
			}).success,
		).toBe(false);
		expect(
			createSessionInput.safeParse({
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
				permissionMode: "bypassPermissions",
			}).success,
		).toBe(false);
		expect(
			setPermissionModeInput.safeParse({
				sessionId: SESSION_ID,
				permissionMode: "bypassPermissions",
			}).success,
		).toBe(false);
		expect(retrySessionInput.parse({ sessionId: SESSION_ID })).toEqual({
			sessionId: SESSION_ID,
		});
		expect(
			retrySessionInput.safeParse({
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
			}).success,
		).toBe(false);
	});

	test("sendMessage validates the SDKUserMessage outer contract", () => {
		const valid = {
			sessionId: SESSION_ID,
			message: {
				type: "user",
				message: { role: "user", content: "hello" },
				parent_tool_use_id: null,
			},
		};
		expect(sendMessageInput.safeParse(valid).success).toBe(true);
		expect(
			sendMessageInput.safeParse({
				...valid,
				message: { type: "assistant", message: valid.message.message },
			}).success,
		).toBe(false);
	});

	test("respondToPermission preserves allow edits and SDK suggestions", () => {
		const parsed = respondToPermissionInput.parse({
			sessionId: SESSION_ID,
			requestId: "request-1",
			response: {
				behavior: "allow",
				updatedInput: { command: "bun test" },
				updatedPermissions: [
					{
						type: "addRules",
						rules: [{ toolName: "Bash", ruleContent: "bun test:*" }],
						behavior: "allow",
						destination: "session",
					},
				],
				decisionClassification: "user_permanent",
			},
		});
		expect(parsed.response.behavior).toBe("allow");
		expect(
			createSessionInput.safeParse({
				sessionId: "not-a-uuid",
				workspaceId: WORKSPACE_ID,
			}).success,
		).toBe(false);
		expect(
			respondToPermissionInput.safeParse({
				sessionId: SESSION_ID,
				requestId: "request-1",
				response: { behavior: "deny" },
			}).success,
		).toBe(false);
		expect(
			respondToPermissionInput.safeParse({
				sessionId: SESSION_ID,
				requestId: "request-1",
				response: {
					behavior: "allow",
					updatedPermissions: [
						{
							type: "setMode",
							mode: "bypassPermissions",
							destination: "session",
						},
					],
				},
			}).success,
		).toBe(false);
	});
});

describe("session envelope validation", () => {
	test("accepts raw SDK messages and state-independent reset seq 0", () => {
		expect(
			sessionEventEnvelopeSchema.safeParse({
				seq: 1,
				sessionId: SESSION_ID,
				ts: 1,
				frame: {
					kind: "sdk",
					message: {
						type: "system",
						subtype: "session_state_changed",
						state: "running",
						uuid: "message-1",
						session_id: "claude-1",
					},
				},
			}).success,
		).toBe(true);
		expect(
			sessionEventEnvelopeSchema.safeParse({
				seq: 0,
				sessionId: SESSION_ID,
				ts: 1,
				frame: { kind: "reset", reason: "cursor_ahead", latestSeq: 3 },
			}).success,
		).toBe(true);
	});

	test("rejects seq 0 for normal frames and structurally invalid JSON", () => {
		expect(
			sessionEventEnvelopeSchema.safeParse({
				seq: 0,
				sessionId: SESSION_ID,
				ts: 1,
				frame: { kind: "sdk", message: { type: "assistant" } },
			}).success,
		).toBe(false);
		expect(
			sessionEventEnvelopeSchema.safeParse({
				seq: 1,
				sessionId: SESSION_ID,
				ts: 1,
				frame: { kind: "sdk", message: { type: "assistant" } },
			}).success,
		).toBe(false);
		expect(
			sessionEventEnvelopeSchema.safeParse({
				seq: "1",
				sessionId: SESSION_ID,
				ts: 1,
				frame: { kind: "wat" },
			}).success,
		).toBe(false);
	});
});
