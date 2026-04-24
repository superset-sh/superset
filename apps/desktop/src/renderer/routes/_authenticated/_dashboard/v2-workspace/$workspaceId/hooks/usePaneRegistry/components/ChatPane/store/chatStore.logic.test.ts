import { describe, expect, it } from "bun:test";
import type {
	ApprovalRequest,
	AssistantMessage,
	ChatStreamEvent,
	Message,
	Part,
	PartDeltaEvent,
	SessionStatus,
	TextPart,
	TodoItem,
	ToolPart,
	UserMessage,
} from "@superset/chat/shared";
import {
	addOptimistic,
	applySessionSnapshot,
	applyStreamEvent,
	emptyChatStoreData,
	replaceOptimistic,
	rollbackOptimistic,
} from "./chatStore.logic";

const SESSION = "sess_01";

// Keep message IDs lexicographically ordered so insertSorted behaves.
const userMsg = (id: string, at = 1000): UserMessage => ({
	id,
	sessionID: SESSION,
	role: "user",
	time: { created: at },
});
const asstMsg = (id: string, parentID: string, at = 2000): AssistantMessage => ({
	id,
	sessionID: SESSION,
	role: "assistant",
	parentID,
	time: { created: at },
	modelID: "claude-sonnet-4-6",
	providerID: "anthropic",
});
const textPart = (
	id: string,
	messageID: string,
	text: string,
): TextPart => ({
	id,
	messageID,
	sessionID: SESSION,
	type: "text",
	text,
	time: { start: 0 },
});
const toolPart = (id: string, messageID: string, tool: string): ToolPart => ({
	id,
	messageID,
	sessionID: SESSION,
	type: "tool",
	tool,
	state: { kind: "input-streaming", input: {} },
	time: { start: 0 },
});

let seq = 1;
const envelope = () => ({
	sequence: seq++,
	sessionID: SESSION,
	at: 1_000_000,
});

const statusEvent = (status: SessionStatus): ChatStreamEvent => ({
	...envelope(),
	type: "session.status",
	status,
});
const messageEvent = (message: Message, optID?: string): ChatStreamEvent => ({
	...envelope(),
	type: "message.append",
	message,
	optID,
});
const partEvent = (part: Part): ChatStreamEvent => ({
	...envelope(),
	type: "part.append",
	part,
});
const textDelta = (
	partID: string,
	messageID: string,
	delta: string,
): PartDeltaEvent => ({
	...envelope(),
	type: "part.delta",
	partID,
	messageID,
	kind: "text",
	delta,
});
const toolInputDelta = (
	partID: string,
	messageID: string,
	inputDelta: unknown,
): PartDeltaEvent => ({
	...envelope(),
	type: "part.delta",
	partID,
	messageID,
	kind: "tool.input",
	inputDelta,
});
const toolStateDelta = (
	partID: string,
	messageID: string,
	state: Extract<PartDeltaEvent, { kind: "tool.state" }>["state"],
): PartDeltaEvent => ({
	...envelope(),
	type: "part.delta",
	partID,
	messageID,
	kind: "tool.state",
	state,
});
const approvalDockEvent = (request: ApprovalRequest | null): ChatStreamEvent => ({
	...envelope(),
	type: "dock.approval.set",
	request,
});
const todosDockEvent = (todos: TodoItem[]): ChatStreamEvent => ({
	...envelope(),
	type: "dock.todos",
	todos,
});
const revertDockEvent = (messageID: string | null): ChatStreamEvent => ({
	...envelope(),
	type: "dock.revert",
	messageID,
});
const errorEvent = (
	message: string,
	kind?: "aborted" | "provider_auth" | "unknown",
): ChatStreamEvent => ({
	...envelope(),
	type: "error",
	error: { message, kind },
});

describe("applySessionSnapshot", () => {
	it("populates messages, parts, status, and historyMore for a session", () => {
		const next = applySessionSnapshot(emptyChatStoreData(), SESSION, {
			messages: [userMsg("u1")],
			parts: { u1: [textPart("p1", "u1", "hi")] },
			status: { type: "idle" },
			historyMore: false,
		});

		expect(next.messages[SESSION]?.map((m) => m.id)).toEqual(["u1"]);
		expect(next.parts.u1).toHaveLength(1);
		expect(next.status[SESSION]).toEqual({ type: "idle" });
		expect(next.historyMore[SESSION]).toBe(false);
	});

	it("replaces a prior snapshot's messages and prunes stale parts for the session", () => {
		const first = applySessionSnapshot(emptyChatStoreData(), SESSION, {
			messages: [userMsg("u1")],
			parts: { u1: [textPart("p1", "u1", "old")] },
			status: { type: "idle" },
			historyMore: false,
		});
		const second = applySessionSnapshot(first, SESSION, {
			messages: [userMsg("u2")],
			parts: { u2: [textPart("p2", "u2", "new")] },
			status: { type: "busy" },
			historyMore: true,
		});

		expect(second.messages[SESSION]?.map((m) => m.id)).toEqual(["u2"]);
		expect(second.parts.u1).toBeUndefined();
		expect(second.parts.u2?.[0]?.id).toBe("p2");
		expect(second.status[SESSION]).toEqual({ type: "busy" });
	});

	it("preserves opt-* messages when a snapshot has no matching real", () => {
		// Simulate: user just hit send; we addOptimistic'd 'opt-1', then a
		// poll snapshot landed WITHOUT the real message yet.
		const optUser = userMsg("opt-1", 500);
		const optText = textPart("opt-1:p0", "opt-1", "hello");
		const seeded = applySessionSnapshot(emptyChatStoreData(), SESSION, {
			messages: [optUser],
			parts: { "opt-1": [optText] },
			status: { type: "busy" },
			historyMore: false,
		});
		// Next snapshot from the dual-write — server hasn't persisted yet.
		const next = applySessionSnapshot(seeded, SESSION, {
			messages: [], // empty — server not ready
			parts: {},
			status: { type: "busy" },
			historyMore: false,
		});
		expect(next.messages[SESSION]?.map((m) => m.id)).toEqual(["opt-1"]);
		expect(next.parts["opt-1"]).toHaveLength(1);
	});

	it("drops opt-* messages when the snapshot has a real with matching text", () => {
		const optUser = userMsg("opt-1", 500);
		const optText = textPart("opt-1:p0", "opt-1", "hello");
		const seeded = applySessionSnapshot(emptyChatStoreData(), SESSION, {
			messages: [optUser],
			parts: { "opt-1": [optText] },
			status: { type: "busy" },
			historyMore: false,
		});
		// Real user message with same text arrives.
		const realUser = userMsg("u-real", 600);
		const realText = textPart("u-real:p0", "u-real", "hello");
		const next = applySessionSnapshot(seeded, SESSION, {
			messages: [realUser],
			parts: { "u-real": [realText] },
			status: { type: "busy" },
			historyMore: false,
		});
		expect(next.messages[SESSION]?.map((m) => m.id)).toEqual(["u-real"]);
		expect(next.parts["opt-1"]).toBeUndefined();
		expect(next.parts["u-real"]?.[0]?.id).toBe("u-real:p0");
	});

	it("keeps opt-* messages whose text does not shadow any snapshot real", () => {
		const optUser = userMsg("opt-1", 500);
		const optText = textPart("opt-1:p0", "opt-1", "new question");
		const seeded = applySessionSnapshot(emptyChatStoreData(), SESSION, {
			messages: [optUser],
			parts: { "opt-1": [optText] },
			status: { type: "busy" },
			historyMore: false,
		});
		// Snapshot has an older real message but NOT our opt yet.
		const older = userMsg("u-old", 100);
		const olderText = textPart("u-old:p0", "u-old", "earlier question");
		const next = applySessionSnapshot(seeded, SESSION, {
			messages: [older],
			parts: { "u-old": [olderText] },
			status: { type: "busy" },
			historyMore: false,
		});
		expect(next.messages[SESSION]?.map((m) => m.id)).toEqual([
			"u-old",
			"opt-1",
		]);
	});
});

describe("applyStreamEvent — messages and parts", () => {
	it("applies a session.status event", () => {
		const next = applyStreamEvent(
			emptyChatStoreData(),
			statusEvent({ type: "busy" }),
		);
		expect(next.status[SESSION]).toEqual({ type: "busy" });
	});

	it("appends a message, idempotent on reapply", () => {
		const first = applyStreamEvent(
			emptyChatStoreData(),
			messageEvent(userMsg("u1")),
		);
		const second = applyStreamEvent(first, messageEvent(userMsg("u1")));
		expect(second.messages[SESSION]).toHaveLength(1);
	});

	it("inserts messages in ID-sorted order regardless of arrival order", () => {
		let state = emptyChatStoreData();
		state = applyStreamEvent(state, messageEvent(userMsg("u3")));
		state = applyStreamEvent(state, messageEvent(userMsg("u1")));
		state = applyStreamEvent(state, messageEvent(userMsg("u2")));
		expect(state.messages[SESSION]?.map((m) => m.id)).toEqual([
			"u1",
			"u2",
			"u3",
		]);
	});

	it("appends a part and coalesces text deltas", () => {
		let state = emptyChatStoreData();
		state = applyStreamEvent(state, messageEvent(asstMsg("a1", "u1")));
		state = applyStreamEvent(state, partEvent(textPart("tp1", "a1", "")));
		state = applyStreamEvent(state, textDelta("tp1", "a1", "Hello"));
		state = applyStreamEvent(state, textDelta("tp1", "a1", ", world"));

		const part = state.parts.a1?.[0];
		if (!part || part.type !== "text") throw new Error("expected text part");
		expect(part.text).toBe("Hello, world");
	});

	it("merges tool input objects and transitions tool state", () => {
		let state = emptyChatStoreData();
		state = applyStreamEvent(state, messageEvent(asstMsg("a1", "u1")));
		state = applyStreamEvent(state, partEvent(toolPart("tp1", "a1", "edit")));
		state = applyStreamEvent(
			state,
			toolInputDelta("tp1", "a1", { path: "foo.ts" }),
		);
		state = applyStreamEvent(
			state,
			toolInputDelta("tp1", "a1", { oldString: "a", newString: "b" }),
		);
		state = applyStreamEvent(
			state,
			toolStateDelta("tp1", "a1", { kind: "running" }),
		);
		state = applyStreamEvent(
			state,
			toolStateDelta("tp1", "a1", {
				kind: "completed",
				output: { changed: 1 },
			}),
		);

		const tool = state.parts.a1?.[0];
		if (!tool || tool.type !== "tool") throw new Error("expected tool part");
		expect(tool.state.kind).toBe("completed");
		expect(tool.state.input).toEqual({
			path: "foo.ts",
			oldString: "a",
			newString: "b",
		});
		if (tool.state.kind === "completed") {
			expect(tool.state.output).toEqual({ changed: 1 });
		}
	});

	it("sets part.end time on part.complete", () => {
		let state = emptyChatStoreData();
		state = applyStreamEvent(state, messageEvent(asstMsg("a1", "u1")));
		state = applyStreamEvent(state, partEvent(textPart("tp1", "a1", "hi")));
		const completionAt = 1_730_000_000;
		state = applyStreamEvent(state, {
			...envelope(),
			at: completionAt,
			type: "part.complete",
			partID: "tp1",
			messageID: "a1",
		});
		expect(state.parts.a1?.[0]?.time.end).toBe(completionAt);
	});

	it("ignores deltas for unknown parts instead of crashing", () => {
		const state = emptyChatStoreData();
		const next = applyStreamEvent(state, textDelta("nope", "nope", "x"));
		expect(next).toBe(state);
	});
});

describe("applyStreamEvent — docks", () => {
	it("sets and clears an approval request", () => {
		let state = emptyChatStoreData();
		state = applyStreamEvent(
			state,
			approvalDockEvent({
				id: "req1",
				toolCallID: "tc1",
				toolName: "shell",
				args: { cmd: "ls" },
			}),
		);
		expect(state.docks[SESSION]?.approval?.id).toBe("req1");

		state = applyStreamEvent(state, approvalDockEvent(null));
		expect(state.docks[SESSION]?.approval).toBeUndefined();
	});

	it("stores todos and a revert marker", () => {
		let state = emptyChatStoreData();
		state = applyStreamEvent(
			state,
			todosDockEvent([
				{ id: "t1", content: "write plan", status: "in_progress" },
				{ id: "t2", content: "ship it", status: "pending" },
			]),
		);
		expect(state.docks[SESSION]?.todos).toHaveLength(2);

		state = applyStreamEvent(state, revertDockEvent("u2"));
		expect(state.docks[SESSION]?.revertMessageID).toBe("u2");

		state = applyStreamEvent(state, revertDockEvent(null));
		expect(state.docks[SESSION]?.revertMessageID).toBeUndefined();
	});
});

describe("optimistic lifecycle", () => {
	it("adds, replaces, and re-keys parts on confirmation", () => {
		let state = emptyChatStoreData();
		const optMsg = userMsg("opt-01", 500);
		const optParts: Part[] = [textPart("opt-p1", "opt-01", "hi")];
		state = addOptimistic(state, SESSION, optMsg, optParts);
		expect(state.messages[SESSION]?.[0]?.id).toBe("opt-01");
		expect(state.parts["opt-01"]).toHaveLength(1);

		const confirmed = { message: userMsg("u1", 500), parts: [textPart("p1", "u1", "hi")] };
		state = replaceOptimistic(state, SESSION, "opt-01", confirmed);
		expect(state.messages[SESSION]?.[0]?.id).toBe("u1");
		expect(state.parts["opt-01"]).toBeUndefined();
		expect(state.parts.u1).toHaveLength(1);
	});

	it("rollback removes the optimistic message and its parts", () => {
		let state = emptyChatStoreData();
		state = addOptimistic(
			state,
			SESSION,
			userMsg("opt-01"),
			[textPart("opt-p1", "opt-01", "hi")],
		);
		state = rollbackOptimistic(state, SESSION, "opt-01");
		expect(state.messages[SESSION] ?? []).toHaveLength(0);
		expect(state.parts["opt-01"]).toBeUndefined();
	});

	it("handles message.append with optID by re-keying parts to the confirmed id", () => {
		let state = emptyChatStoreData();
		state = addOptimistic(
			state,
			SESSION,
			userMsg("opt-01"),
			[textPart("opt-p1", "opt-01", "hi")],
		);
		state = applyStreamEvent(state, messageEvent(userMsg("u1"), "opt-01"));
		expect(state.messages[SESSION]?.map((m) => m.id)).toEqual(["u1"]);
		expect(state.parts["opt-01"]).toBeUndefined();
		expect(state.parts.u1?.[0]?.messageID).toBe("u1");
	});

	it("rollback is a no-op if the optimistic is already gone", () => {
		const state = emptyChatStoreData();
		const next = rollbackOptimistic(state, SESSION, "opt-missing");
		expect(next).toBe(state);
	});
});

describe("applyStreamEvent — errors", () => {
	it("records the latest per-session error", () => {
		const state = applyStreamEvent(
			emptyChatStoreData(),
			errorEvent("provider down", "provider_auth"),
		);
		expect(state.errors[SESSION]?.message).toBe("provider down");
		expect(state.errors[SESSION]?.kind).toBe("provider_auth");
	});
});
