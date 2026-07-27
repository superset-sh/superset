import { describe, expect, test } from "bun:test";
import type { SessionEvent, SessionEventPayload } from "../protocol/events";
import {
	emptyTimeline,
	foldTimeline,
	makeSelectedOutcome,
	selectedOptionIds,
	type TimelineMessageItem,
	type TimelineToolCallItem,
} from "./timeline";

const SESSION_ID = "session-1";
const MAIN_THREAD = "session-1:main";

function makeEvents(
	payloads: Array<
		SessionEventPayload | { threadId: string; payload: SessionEventPayload }
	>,
): SessionEvent[] {
	return payloads.map((entry, index) => {
		const payload = "payload" in entry ? entry.payload : entry;
		const threadId = "payload" in entry ? entry.threadId : MAIN_THREAD;
		return {
			id: `event-${index + 1}`,
			sessionId: SESSION_ID,
			threadId,
			cursor: `cursor-${index + 1}`,
			occurredAt: 1_000 + index,
			causationId: null,
			payload,
		};
	});
}

function userMessage(
	id: string,
	turnId: string,
	text: string,
): SessionEventPayload {
	return {
		type: "messageStarted",
		message: {
			id,
			sessionId: SESSION_ID,
			threadId: MAIN_THREAD,
			turnId,
			role: "user",
			content: [{ type: "text", text }],
			createdAt: 1_000,
		},
	};
}

function assistantMessageStarted(
	id: string,
	turnId: string,
): SessionEventPayload {
	return {
		type: "messageStarted",
		message: {
			id,
			sessionId: SESSION_ID,
			threadId: MAIN_THREAD,
			turnId,
			role: "assistant",
			content: [],
			createdAt: 1_001,
		},
	};
}

function toolCallStarted(
	toolCallId: string,
	overrides: Partial<{
		parentToolCallId: string | null;
		threadId: string;
		title: string;
	}> = {},
): SessionEventPayload {
	return {
		type: "toolCallStarted",
		toolCall: {
			id: toolCallId,
			sessionId: SESSION_ID,
			threadId: overrides.threadId ?? MAIN_THREAD,
			turnId: "turn-1",
			parentToolCallId: overrides.parentToolCallId ?? null,
			tool: { name: "bash", version: 1 },
			title: overrides.title ?? "Run command",
			input: { command: "ls" },
			resolver: { type: "host" },
			state: "running",
			createdAt: 1_002,
			updatedAt: 1_002,
			expiresAt: null,
		},
	};
}

describe("foldTimeline", () => {
	test("folds a user prompt and streamed assistant reply with thought split", () => {
		const events = makeEvents([
			userMessage("m-user", "turn-1", "say hi"),
			assistantMessageStarted("m-agent", "turn-1"),
			{
				type: "messageDelta",
				messageId: "m-agent",
				content: { type: "thought", text: "thinking about " },
			},
			{
				type: "messageDelta",
				messageId: "m-agent",
				content: { type: "thought", text: "greetings" },
			},
			{
				type: "messageDelta",
				messageId: "m-agent",
				content: { type: "text", text: "hi " },
			},
			{
				type: "messageDelta",
				messageId: "m-agent",
				content: { type: "text", text: "there" },
			},
			{ type: "messageCompleted", messageId: "m-agent" },
		]);
		const timeline = foldTimeline(emptyTimeline(), events);
		expect(timeline.items).toHaveLength(3);
		const [user, thought, reply] = timeline.items as TimelineMessageItem[];
		expect(user?.role).toBe("user");
		expect(user?.blocks).toEqual([{ type: "text", text: "say hi" }]);
		expect(thought?.role).toBe("thought");
		expect(thought?.blocks).toEqual([
			{ type: "text", text: "thinking about greetings" },
		]);
		expect(reply?.role).toBe("agent");
		expect(reply?.blocks).toEqual([{ type: "text", text: "hi there" }]);
	});

	test("incremental fold matches folding all events at once", () => {
		const events = makeEvents([
			userMessage("m-user", "turn-1", "say hi"),
			assistantMessageStarted("m-agent", "turn-1"),
			{
				type: "messageDelta",
				messageId: "m-agent",
				content: { type: "text", text: "hi " },
			},
			{
				type: "messageDelta",
				messageId: "m-agent",
				content: { type: "text", text: "there" },
			},
		]);
		const full = foldTimeline(emptyTimeline(), events);
		const first = foldTimeline(emptyTimeline(), events.slice(0, 2));
		const resumed = foldTimeline(first, events);
		expect(resumed.items).toEqual(full.items);
		expect(resumed.eventCount).toBe(events.length);
		// The earlier fold value is untouched (copy-on-write): the empty-content
		// assistant messageStarted creates no item until deltas arrive.
		expect(first.items).toHaveLength(1);
	});

	test("tool call updates merge and permissions attach and resolve", () => {
		const events = makeEvents([
			toolCallStarted("tool-1"),
			{
				type: "permissionRequested",
				permission: {
					id: "perm-1",
					sessionId: SESSION_ID,
					threadId: MAIN_THREAD,
					toolCallId: "tool-1",
					options: [
						{ id: "allow", name: "Allow", kind: "allowOnce" },
						{ id: "deny", name: "Deny", kind: "rejectOnce" },
					],
					multiSelect: false,
					requestedAt: 1_003,
				},
			},
		]);
		let timeline = foldTimeline(emptyTimeline(), events);
		expect(timeline.pendingPermissions).toHaveLength(1);
		expect(timeline.pendingPermissions[0]?.toolCall.title).toBe("Run command");

		const resolved = makeEvents([
			toolCallStarted("tool-1"),
			events[1]?.payload as SessionEventPayload,
			{
				type: "permissionResolved",
				permissionId: "perm-1",
				outcome: { type: "selected", optionIds: ["allow"] },
			},
			{
				type: "toolCallUpdated",
				toolCallId: "tool-1",
				update: { state: "succeeded", output: { ok: true }, updatedAt: 1_005 },
			},
		]);
		timeline = foldTimeline(emptyTimeline(), resolved);
		expect(timeline.pendingPermissions).toHaveLength(0);
		const item = timeline.items[0] as TimelineToolCallItem;
		expect(item.call.state).toBe("succeeded");
		expect(item.call.output).toEqual({ ok: true });
		expect(item.permissions[0]?.resolution).toEqual({
			type: "selected",
			optionIds: ["allow"],
		});
	});

	test("subagent thread items nest under the spawning tool call", () => {
		const subThread = "session-1:sub";
		const events = makeEvents([
			toolCallStarted("task-1", { title: "Task" }),
			{
				type: "threadCreated",
				thread: {
					id: subThread,
					sessionId: SESSION_ID,
					kind: "subagent",
					parentThreadId: MAIN_THREAD,
					origin: {
						type: "subagent",
						spawnedByEventId: "event-1",
						spawnedByToolCallId: "task-1",
					},
					fidelity: "full",
					title: null,
					runState: "running",
					eventHead: null,
					createdAt: 1_003,
					updatedAt: 1_003,
					lastActivityAt: 1_003,
				},
			},
			{
				threadId: subThread,
				payload: toolCallStarted("tool-child", {
					threadId: subThread,
					title: "Child",
				}),
			},
		]);
		const timeline = foldTimeline(emptyTimeline(), events);
		expect(timeline.items).toHaveLength(1);
		const task = timeline.items[0] as TimelineToolCallItem;
		expect(task.id).toBe("task-1");
		expect(task.children).toHaveLength(1);
		expect((task.children[0] as TimelineToolCallItem).id).toBe("tool-child");
	});

	test("plan upserts in place and empty plan marks removed", () => {
		const entry = (id: string, status: "pending" | "completed") => ({
			id,
			content: `step ${id}`,
			status,
			priority: null,
		});
		const events = makeEvents([
			{ type: "planUpdated", plan: [entry("1", "pending")] },
			{ type: "planUpdated", plan: [entry("1", "completed")] },
		]);
		let timeline = foldTimeline(emptyTimeline(), events);
		expect(timeline.items).toHaveLength(1);
		expect(
			timeline.items[0]?.kind === "plan" &&
				timeline.items[0].entries[0]?.status,
		).toBe("completed");

		timeline = foldTimeline(
			timeline,
			[...events, ...makeEvents([{ type: "planUpdated", plan: [] }])].map(
				(event, index) => ({ ...event, id: `event-${index + 1}` }),
			),
		);
		expect(
			timeline.items[0]?.kind === "plan" && timeline.items[0].removed,
		).toBe(true);
	});

	test("turnFailed marks the turn's user message and records the error", () => {
		const events = makeEvents([
			userMessage("m-user", "turn-1", "do a thing"),
			{
				type: "turnFailed",
				turnId: "turn-1",
				error: {
					code: "INTERNAL_ERROR",
					retryable: false,
					recovery: "none",
					occurredAt: 1_001,
				},
			},
		]);
		const timeline = foldTimeline(emptyTimeline(), events);
		const user = timeline.items[0] as TimelineMessageItem;
		expect(user.failed).toBe(true);
		expect(timeline.lastError).toBe("INTERNAL_ERROR");
	});
});

describe("outcome helpers", () => {
	test("round-trips single and multi selections", () => {
		expect(selectedOptionIds(makeSelectedOutcome(["a"]))).toEqual(["a"]);
		expect(selectedOptionIds(makeSelectedOutcome(["a", "b"]))).toEqual([
			"a",
			"b",
		]);
		expect(selectedOptionIds({ type: "cancelled" })).toEqual([]);
		expect(() => makeSelectedOutcome([])).toThrow();
	});
});
