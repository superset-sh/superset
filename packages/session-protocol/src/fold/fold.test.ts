import { describe, expect, test } from "bun:test";
import type { SessionEventEnvelope, SessionEventFrame } from "../events";
import type { SDKMessage, SessionMessage } from "../sdk-types";
import type { PendingPermissionRequest, SessionScopedState } from "../state";
import {
	emptyTimeline,
	foldEnvelope,
	foldEnvelopes,
	foldSessionMessages,
} from "./fold";

let seq = 0;
const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const CLAUDE_SESSION_ID = "00000000-0000-4000-8000-000000000003";

function envelope(frame: SessionEventFrame): SessionEventEnvelope {
	seq += 1;
	return { seq, sessionId: SESSION_ID, ts: seq, frame };
}

function sdk(message: SDKMessage): SessionEventEnvelope {
	return envelope({ kind: "sdk", message });
}

function assistant(
	uuid: string,
	content: Array<Record<string, unknown>>,
): SDKMessage {
	return {
		type: "assistant",
		uuid,
		session_id: "claude-1",
		parent_tool_use_id: null,
		message: { content },
	} as unknown as SDKMessage;
}

function user(
	uuid: string,
	content: string | Array<Record<string, unknown>>,
): SDKMessage {
	return {
		type: "user",
		uuid,
		session_id: "claude-1",
		parent_tool_use_id: null,
		message: { role: "user", content },
	} as unknown as SDKMessage;
}

function state(overrides?: Partial<SessionScopedState>): SessionScopedState {
	return {
		sessionId: SESSION_ID,
		claudeSessionId: CLAUDE_SESSION_ID,
		workspaceId: WORKSPACE_ID,
		harness: "claude",
		status: "running",
		model: "claude-opus-4-6",
		permissionMode: "default",
		effort: "high",
		pendingPermissions: [],
		pendingUserDialogs: [],
		pendingElicitations: [],
		cwd: "/tmp/workspace",
		lastSeq: seq,
		lastError: null,
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

function permission(): PendingPermissionRequest {
	return {
		requestId: "request-1",
		toolUseID: "tool-1",
		toolName: "Bash",
		input: { command: "bun test" },
		title: "Claude wants to run bun test",
		requestedAt: 1,
	};
}

describe("SDK message folding", () => {
	test("folds assistant text and tool use, then attaches a user tool result", () => {
		seq = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			sdk(
				assistant("assistant-1", [
					{ type: "text", text: "I will run the tests." },
					{
						type: "tool_use",
						id: "tool-1",
						name: "Bash",
						input: { command: "bun test" },
					},
					{ type: "text", text: "The tests finished." },
				]),
			),
			sdk(
				user("user-1", [
					{
						type: "tool_result",
						tool_use_id: "tool-1",
						content: "12 pass",
					},
				]),
			),
		]);
		expect(timeline.items.map((item) => item.kind)).toEqual([
			"message",
			"tool_call",
			"message",
		]);
		const tool = timeline.items.find((item) => item.kind === "tool_call");
		expect(tool?.name).toBe("Bash");
		expect(tool?.status).toBe("completed");
		const message = timeline.items.find((item) => item.kind === "message");
		expect(message?.blocks[0]).toMatchObject({
			type: "text",
			text: "I will run the tests.",
		});
	});

	test("partial text is accumulated and replaced by the complete message", () => {
		seq = 0;
		const partial = (text: string): SDKMessage =>
			({
				type: "stream_event",
				uuid: "assistant-1",
				session_id: "claude-1",
				parent_tool_use_id: null,
				event: {
					type: "content_block_delta",
					delta: { type: "text_delta", text },
				},
			}) as unknown as SDKMessage;
		const timeline = foldEnvelopes(emptyTimeline(), [
			sdk(partial("hel")),
			sdk(partial("lo")),
			sdk(assistant("assistant-1", [{ type: "text", text: "hello" }])),
		]);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "message") throw new Error("expected message");
		expect(item.partial).toBe(false);
		expect(item.blocks[0]).toMatchObject({ type: "text", text: "hello" });
	});

	test("SDK init/state messages update metadata without inventing state", () => {
		seq = 0;
		const init = {
			type: "system",
			subtype: "init",
			session_id: "claude-1",
			uuid: "init-1",
			model: "claude-sonnet-4-6",
			permissionMode: "plan",
		} as unknown as SDKMessage;
		const running: SDKMessage = {
			type: "system",
			subtype: "session_state_changed",
			state: "running",
			session_id: "claude-1",
			uuid: "state-1",
		};
		const timeline = foldEnvelopes(emptyTimeline(), [sdk(init), sdk(running)]);
		expect(timeline.meta).toMatchObject({
			claudeSessionId: "claude-1",
			model: "claude-sonnet-4-6",
			permissionMode: "plan",
			sdkState: "running",
		});
		expect(timeline.state).toBeNull();
	});
});

describe("Superset frame folding", () => {
	test("permission request/resolution attaches to its native tool call", () => {
		seq = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			sdk(
				assistant("assistant-1", [
					{
						type: "tool_use",
						id: "tool-1",
						name: "Bash",
						input: { command: "bun test" },
					},
				]),
			),
			envelope({ kind: "permission_requested", request: permission() }),
			envelope({
				kind: "permission_resolved",
				requestId: "request-1",
				response: {
					behavior: "allow",
					updatedInput: { command: "bun test --watch=false" },
				},
			}),
		]);
		const tool = timeline.items[0];
		if (tool?.kind !== "tool_call") throw new Error("expected tool call");
		expect(tool.permissions[0]?.response).toMatchObject({ behavior: "allow" });
	});

	test("state replaces the snapshot and reset marks the timeline", () => {
		seq = 0;
		const withState = foldEnvelope(
			emptyTimeline(),
			envelope({ kind: "state", state: state({ status: "idle" }) }),
		);
		expect(withState.state?.status).toBe("idle");
		const reset = foldEnvelope(withState, {
			seq: 0,
			sessionId: SESSION_ID,
			ts: 2,
			frame: { kind: "reset", reason: "journal_evicted" },
		});
		expect(reset.resetReason).toBe("journal_evicted");
	});

	test("folding is pure", () => {
		seq = 0;
		const before = emptyTimeline();
		const after = foldEnvelope(
			before,
			sdk(user("user-1", "hello from the user")),
		);
		expect(before.items).toHaveLength(0);
		expect(before.lastSeq).toBe(0);
		expect(after).not.toBe(before);
		expect(after.items).not.toBe(before.items);
	});
});

describe("SDK transcript folding", () => {
	test("folds SessionMessage history separately without advancing journal seq", () => {
		const messages: SessionMessage[] = [
			{
				type: "assistant",
				uuid: "assistant-history",
				session_id: "claude-1",
				parent_tool_use_id: null,
				parent_agent_id: null,
				message: {
					content: [
						{ type: "text", text: "history" },
						{
							type: "tool_use",
							id: "history-tool",
							name: "Read",
							input: { file_path: "README.md" },
						},
					],
				},
			},
			{
				type: "user",
				uuid: "user-history",
				session_id: "claude-1",
				parent_tool_use_id: null,
				parent_agent_id: null,
				message: {
					content: [
						{
							type: "tool_result",
							tool_use_id: "history-tool",
							content: "read",
						},
					],
				},
			},
		];
		const timeline = foldSessionMessages(emptyTimeline(), messages);
		expect(timeline.lastSeq).toBe(0);
		const tool = timeline.items.find((item) => item.kind === "tool_call");
		expect(tool?.status).toBe("completed");
		expect(
			timeline.items.find((item) => item.kind === "message"),
		).toBeDefined();
	});
});
