import { describe, expect, test } from "bun:test";
import type { SessionUpdate, ToolCallUpdate } from "../acp";
import type { SessionUpdateEnvelope, SessionUpdateFrame } from "../envelope";
import type { PendingPermission, SessionScopedState } from "../state";
import { emptyTimeline, foldEnvelope, foldEnvelopes } from "./fold";

let seqCounter = 0;

function envelope(
	frame: SessionUpdateFrame,
	seq?: number,
): SessionUpdateEnvelope {
	seqCounter = seq ?? seqCounter + 1;
	return { seq: seqCounter, sessionId: "sess-1", ts: 1000 + seqCounter, frame };
}

function update(u: SessionUpdate): SessionUpdateEnvelope {
	return envelope({ kind: "update", update: u });
}

function textChunk(
	variant: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk",
	text: string,
): SessionUpdateEnvelope {
	return update({ sessionUpdate: variant, content: { type: "text", text } });
}

function pendingPermission(
	overrides?: Partial<PendingPermission>,
): PendingPermission {
	return {
		requestId: "req-1",
		toolCall: {
			toolCallId: "tc-1",
			status: "pending",
		} satisfies ToolCallUpdate,
		options: [
			{ optionId: "allow", name: "Allow", kind: "allow_once" },
			{ optionId: "reject", name: "Reject", kind: "reject_once" },
		],
		requestedAt: 500,
		...overrides,
	};
}

function fakeState(
	overrides?: Partial<SessionScopedState>,
): SessionScopedState {
	return {
		sessionId: "sess-1",
		workspaceId: "ws-1",
		harness: "claude-agent-acp",
		status: "running",
		title: null,
		currentMode: null,
		configOptions: [],
		pendingPermissions: [],
		cwd: "/tmp/ws",
		lastSeq: 0,
		lastStopReason: null,
		lastError: null,
		createdAt: 1,
		updatedAt: 2,
		...overrides,
	};
}

describe("message folding", () => {
	test("consecutive same-role text chunks merge into one item with concatenated text", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("agent_message_chunk", "Hello"),
			textChunk("agent_message_chunk", ", world"),
		]);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "message") throw new Error("expected message");
		expect(item.role).toBe("agent");
		expect(item.blocks).toEqual([{ type: "text", text: "Hello, world" }]);
		expect(item.startSeq).toBe(1);
		expect(item.endSeq).toBe(2);
	});

	test("consecutive user chunks join with a blank line (separate prompt blocks)", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("user_message_chunk", "first message"),
			textChunk("user_message_chunk", "second message"),
		]);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "message") throw new Error("expected message");
		expect(item.blocks).toEqual([
			{ type: "text", text: "first message\n\nsecond message" },
		]);
	});

	test("a seq gap between user chunks starts a new bubble (separate prompts)", () => {
		seqCounter = 0;
		// The host journals one prompt's blocks in a single synchronous run and
		// always emits a state frame between turns, so a non-contiguous seq means
		// a different prompt — the bubbles must not merge.
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("user_message_chunk", "first prompt"),
			envelope({ kind: "state", state: fakeState() }),
			textChunk("user_message_chunk", "second prompt"),
		]);
		const messages = timeline.items.filter((i) => i.kind === "message");
		expect(messages).toHaveLength(2);
	});

	test("prompt_rejected after back-to-back prompts fails only the rejected bubble", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("user_message_chunk", "fine prompt"), // seq 1
			envelope({ kind: "state", state: fakeState() }), // seq 2
			textChunk("user_message_chunk", "doomed prompt"), // seq 3
			envelope({
				kind: "prompt_rejected",
				reason: "adapter exploded",
				promptStartSeq: 3,
			}),
		]);
		const messages = timeline.items.filter((i) => i.kind === "message");
		expect(messages).toHaveLength(2);
		expect(
			messages.map((m) => (m.kind === "message" ? m.failed : null)),
		).toEqual([false, true]);
	});

	test("prompt_rejected marks the user message covering promptStartSeq as failed", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("user_message_chunk", "old prompt"),
			textChunk("agent_message_chunk", "done"),
			textChunk("user_message_chunk", "doomed prompt"), // seq 3
			envelope({
				kind: "prompt_rejected",
				reason: "adapter exploded",
				promptStartSeq: 3,
			}),
		]);
		const messages = timeline.items.filter((i) => i.kind === "message");
		expect(messages).toHaveLength(3);
		expect(
			messages.map((m) => (m.kind === "message" ? m.failed : null)),
		).toEqual([false, false, true]);
	});

	test("role change starts a new message item", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("user_message_chunk", "hi"),
			textChunk("agent_message_chunk", "hello"),
			textChunk("agent_thought_chunk", "thinking..."),
		]);
		expect(
			timeline.items.map((i) => (i.kind === "message" ? i.role : "?")),
		).toEqual(["user", "agent", "thought"]);
	});

	test("non-text block appends instead of concatenating", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("agent_message_chunk", "look:"),
			update({
				sessionUpdate: "agent_message_chunk",
				content: {
					type: "image",
					data: "aGk=",
					mimeType: "image/png",
				},
			}),
			textChunk("agent_message_chunk", "done"),
		]);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "message") throw new Error("expected message");
		expect(item.blocks).toHaveLength(3);
		expect(item.blocks[1]?.type).toBe("image");
	});

	test("an intervening tool call splits the message stream", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			textChunk("agent_message_chunk", "before"),
			update({ sessionUpdate: "tool_call", toolCallId: "tc-1", title: "Read" }),
			textChunk("agent_message_chunk", "after"),
		]);
		expect(timeline.items.map((i) => i.kind)).toEqual([
			"message",
			"tool_call",
			"message",
		]);
	});
});

describe("tool call folding", () => {
	test("tool_call then tool_call_update merge; null/absent patch fields keep previous values", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			update({
				sessionUpdate: "tool_call",
				toolCallId: "tc-1",
				title: "Read file",
				kind: "read",
				status: "pending",
				rawInput: { path: "/a.ts" },
			}),
			update({
				sessionUpdate: "tool_call_update",
				toolCallId: "tc-1",
				status: "completed",
				title: null,
				rawOutput: { ok: true },
			}),
		]);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(item.call.title).toBe("Read file");
		expect(item.call.kind).toBe("read");
		expect(item.call.status).toBe("completed");
		expect(item.call.rawInput).toEqual({ path: "/a.ts" });
		expect(item.call.rawOutput).toEqual({ ok: true });
		expect(item.startSeq).toBe(1);
		expect(item.endSeq).toBe(2);
	});

	test("tool_call_update without a prior tool_call synthesizes an item", () => {
		seqCounter = 0;
		const timeline = foldEnvelope(
			emptyTimeline(),
			update({
				sessionUpdate: "tool_call_update",
				toolCallId: "tc-orphan",
				status: "in_progress",
			}),
		);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(item.id).toBe("tc-orphan");
		expect(item.call.status).toBe("in_progress");
	});

	test("distinct toolCallIds create distinct items", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			update({ sessionUpdate: "tool_call", toolCallId: "tc-1", title: "A" }),
			update({ sessionUpdate: "tool_call", toolCallId: "tc-2", title: "B" }),
			update({
				sessionUpdate: "tool_call_update",
				toolCallId: "tc-1",
				status: "completed",
			}),
		]);
		expect(timeline.items).toHaveLength(2);
		const first = timeline.items[0];
		if (first?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(first.call.status).toBe("completed");
	});
});

describe("permission folding", () => {
	test("permission_requested attaches to its tool call; permission_resolved records the outcome", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			update({
				sessionUpdate: "tool_call",
				toolCallId: "tc-1",
				title: "Bash",
				status: "pending",
			}),
			envelope({ kind: "permission_requested", pending: pendingPermission() }),
			envelope({
				kind: "permission_resolved",
				requestId: "req-1",
				outcome: { outcome: "selected", optionId: "allow" },
			}),
		]);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(item.permissions).toHaveLength(1);
		expect(item.permissions[0]?.requestId).toBe("req-1");
		expect(item.permissions[0]?.resolution).toEqual({
			outcome: "selected",
			optionId: "allow",
		});
	});

	test("permission_requested without a matching tool call synthesizes a standalone item", () => {
		seqCounter = 0;
		const timeline = foldEnvelope(
			emptyTimeline(),
			envelope({ kind: "permission_requested", pending: pendingPermission() }),
		);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(item.id).toBe("tc-1");
		expect(item.permissions[0]?.resolution).toBeNull();
	});

	test("permission_resolved for an unknown requestId is a no-op", () => {
		seqCounter = 0;
		const before = foldEnvelope(
			emptyTimeline(),
			update({ sessionUpdate: "tool_call", toolCallId: "tc-1", title: "A" }),
		);
		const after = foldEnvelope(
			before,
			envelope({
				kind: "permission_resolved",
				requestId: "req-missing",
				outcome: { outcome: "cancelled" },
			}),
		);
		const item = after.items[0];
		if (item?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(item.permissions).toHaveLength(0);
		expect(after.lastSeq).toBe(2);
	});
});

describe("plan folding", () => {
	const entry = (content: string) => ({
		content,
		priority: "medium" as const,
		status: "pending" as const,
	});

	test("plan creates an item; a second plan replaces its entries in place", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			update({ sessionUpdate: "plan", entries: [entry("step 1")] }),
			update({
				sessionUpdate: "plan",
				entries: [entry("step 1"), entry("step 2")],
			}),
		]);
		expect(timeline.items).toHaveLength(1);
		const item = timeline.items[0];
		if (item?.kind !== "plan") throw new Error("expected plan");
		expect(item.entries).toHaveLength(2);
		expect(item.removed).toBe(false);
	});

	test("plan_removed marks the open plan removed; a later plan starts a fresh item", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			update({ sessionUpdate: "plan", entries: [entry("old")] }),
			update({ sessionUpdate: "plan_removed", planId: "p1" }),
			update({ sessionUpdate: "plan", entries: [entry("new")] }),
		]);
		expect(timeline.items).toHaveLength(2);
		const [first, second] = timeline.items;
		if (first?.kind !== "plan" || second?.kind !== "plan") {
			throw new Error("expected two plans");
		}
		expect(first.removed).toBe(true);
		expect(second.entries[0]?.content).toBe("new");
	});
});

describe("meta folding", () => {
	test("session_info_update / config_option_update / available_commands_update land in meta, not items", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			update({
				sessionUpdate: "session_info_update",
				title: "My session",
			}),
			update({
				sessionUpdate: "config_option_update",
				configOptions: [],
			}),
			update({
				sessionUpdate: "available_commands_update",
				availableCommands: [{ name: "review", description: "review code" }],
			}),
		]);
		expect(timeline.items).toHaveLength(0);
		expect(timeline.meta.title).toBe("My session");
		expect(timeline.meta.configOptions).toEqual([]);
		expect(timeline.meta.availableCommands).toHaveLength(1);
	});

	test("current_mode_update updates meta.currentMode", () => {
		seqCounter = 0;
		const timeline = foldEnvelope(
			emptyTimeline(),
			update({ sessionUpdate: "current_mode_update", currentModeId: "plan" }),
		);
		expect(timeline.meta.currentMode?.currentModeId).toBe("plan");
	});
});

describe("state and reset frames", () => {
	test("state frame replaces timeline.state", () => {
		seqCounter = 0;
		const timeline = foldEnvelope(
			emptyTimeline(),
			envelope({ kind: "state", state: fakeState({ status: "idle" }) }),
		);
		expect(timeline.state?.status).toBe("idle");
		expect(timeline.items).toHaveLength(0);
	});

	test("reset frame sets resetReason", () => {
		seqCounter = 0;
		const timeline = foldEnvelope(
			emptyTimeline(),
			envelope({ kind: "reset", reason: "journal_evicted" }),
		);
		expect(timeline.resetReason).toBe("journal_evicted");
	});
});

describe("purity", () => {
	test("folding returns new references and never mutates the input timeline", () => {
		seqCounter = 0;
		const before = foldEnvelope(
			emptyTimeline(),
			textChunk("agent_message_chunk", "a"),
		);
		const beforeItems = before.items;
		const beforeFirst = before.items[0];
		const after = foldEnvelope(before, textChunk("agent_message_chunk", "b"));
		expect(before.items).toBe(beforeItems);
		expect(before.items[0]).toBe(beforeFirst);
		const beforeItem = before.items[0];
		if (beforeItem?.kind !== "message") throw new Error("expected message");
		expect(beforeItem.blocks[0]).toEqual({ type: "text", text: "a" });
		expect(after.items).not.toBe(before.items);
		expect(after.items[0]).not.toBe(before.items[0]);
	});

	test("lastSeq always tracks the folded envelope, even for no-op frames", () => {
		seqCounter = 0;
		const timeline = foldEnvelope(
			emptyTimeline(),
			envelope(
				{
					kind: "permission_resolved",
					requestId: "nope",
					outcome: { outcome: "cancelled" },
				},
				42,
			),
		);
		expect(timeline.lastSeq).toBe(42);
	});
});

// Frame shapes below mirror a captured claude-agent-acp subagent run: the Task
// tool_call is untagged; the subagent's tools arrive as top-level frames tagged
// _meta.claudeCode.parentToolUseId — except some updates (tool_progress, hook
// paths) which arrive UNTAGGED and must still route into the nested item.
describe("subagent nesting", () => {
	const taggedMeta = { claudeCode: { parentToolUseId: "task-1" } };

	function taskThenChild(): SessionUpdateEnvelope[] {
		return [
			update({
				sessionUpdate: "tool_call",
				toolCallId: "task-1",
				title: "Run echo via subagent",
				status: "in_progress",
			}),
			update({
				sessionUpdate: "tool_call",
				toolCallId: "sub-1",
				title: "echo hi",
				status: "pending",
				_meta: taggedMeta,
			}),
		];
	}

	test("a tagged tool_call nests under its Task parent instead of the top level", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), taskThenChild());
		expect(timeline.items).toHaveLength(1);
		const task = timeline.items[0];
		if (task?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(task.children).toHaveLength(1);
		const child = task.children[0];
		if (child?.kind !== "tool_call")
			throw new Error("expected nested tool_call");
		expect(child.id).toBe("sub-1");
		expect(task.endSeq).toBe(2);
	});

	test("an UNTAGGED tool_call_update still routes into the nested child by id", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			...taskThenChild(),
			update({
				sessionUpdate: "tool_call_update",
				toolCallId: "sub-1",
				status: "completed",
			}),
		]);
		expect(timeline.items).toHaveLength(1);
		const task = timeline.items[0];
		if (task?.kind !== "tool_call") throw new Error("expected tool_call");
		const child = task.children[0];
		if (child?.kind !== "tool_call")
			throw new Error("expected nested tool_call");
		expect(child.call.status).toBe("completed");
		expect(child.endSeq).toBe(3);
		expect(task.endSeq).toBe(3);
	});

	test("permissions for a nested child attach and resolve on the nested item", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			...taskThenChild(),
			envelope({
				kind: "permission_requested",
				pending: pendingPermission({
					toolCall: { toolCallId: "sub-1", status: "pending" },
				}),
			}),
			envelope({
				kind: "permission_resolved",
				requestId: "req-1",
				outcome: { outcome: "selected", optionId: "allow" },
			}),
		]);
		expect(timeline.items).toHaveLength(1);
		const task = timeline.items[0];
		if (task?.kind !== "tool_call") throw new Error("expected tool_call");
		expect(task.permissions).toHaveLength(0);
		const child = task.children[0];
		if (child?.kind !== "tool_call")
			throw new Error("expected nested tool_call");
		expect(child.permissions).toHaveLength(1);
		expect(child.permissions[0]?.resolution).toEqual({
			outcome: "selected",
			optionId: "allow",
		});
	});

	test("a late tag re-homes an item that untagged frames parked at top level", () => {
		seqCounter = 0;
		const timeline = foldEnvelopes(emptyTimeline(), [
			update({
				sessionUpdate: "tool_call",
				toolCallId: "task-1",
				title: "Task",
				status: "in_progress",
			}),
			// Untagged frame arrives first (e.g. tool_progress) → top level.
			update({
				sessionUpdate: "tool_call_update",
				toolCallId: "sub-1",
				status: "in_progress",
			}),
			// First tagged frame reveals the parent.
			update({
				sessionUpdate: "tool_call_update",
				toolCallId: "sub-1",
				title: "echo hi",
				_meta: taggedMeta,
			}),
		]);
		expect(timeline.items).toHaveLength(1);
		const task = timeline.items[0];
		if (task?.kind !== "tool_call") throw new Error("expected tool_call");
		const child = task.children[0];
		if (child?.kind !== "tool_call")
			throw new Error("expected nested tool_call");
		expect(child.id).toBe("sub-1");
		expect(child.call.title).toBe("echo hi");
		expect(child.call.status).toBe("in_progress");
	});

	test("a tagged child whose parent was never seen stays top-level (no throw)", () => {
		seqCounter = 0;
		const timeline = foldEnvelope(
			emptyTimeline(),
			update({
				sessionUpdate: "tool_call",
				toolCallId: "sub-orphan",
				title: "orphan",
				_meta: { claudeCode: { parentToolUseId: "task-missing" } },
			}),
		);
		expect(timeline.items).toHaveLength(1);
		expect(timeline.items[0]?.kind).toBe("tool_call");
	});
});
