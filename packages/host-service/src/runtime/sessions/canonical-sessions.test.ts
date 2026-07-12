import { describe, expect, test } from "bun:test";
import {
	createSessionResultSchema,
	eventsWindowSchema,
	sessionEventSchema,
	sessionSnapshotSchema,
} from "@superset/host-service-sync/protocol";
import { selectedOptionIds } from "@superset/session-protocol";
import { CanonicalSessionsError } from "./canonical-sessions";
import {
	FakeAcpPort,
	MODEL_OPTIONS,
	makeRuntime,
	WORKSPACE,
} from "./testing/fake-acp-port";
import { acpMainThreadId } from "./translate-acp";

type ErrorCode = CanonicalSessionsError["code"];

function expectCode(error: unknown, code: ErrorCode) {
	expect(error).toBeInstanceOf(CanonicalSessionsError);
	expect((error as CanonicalSessionsError).code).toBe(code);
}

async function rejectsWith(promise: Promise<unknown>, code: ErrorCode) {
	let thrown: unknown = null;
	try {
		await promise;
	} catch (error) {
		thrown = error;
	}
	expect(thrown).not.toBeNull();
	expectCode(thrown, code);
}

describe("CanonicalSessionsRuntime", () => {
	test("createSession is idempotent and yields a schema-valid session + main thread", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);

		const result = await runtime.createSession({
			requestId: "req-create-1",
			workspaceId: WORKSPACE,
			agentId: "claude-code",
			title: "My session",
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
		});
		createSessionResultSchema.parse(result);
		expect(result.session.id).toBe("session-minted-1");
		expect(result.session.title).toBe("My session");
		expect(result.session.mainThreadId).toBe(
			acpMainThreadId("session-minted-1"),
		);
		expect(result.mainThread.kind).toBe("main");
		expect(port.createCalls).toBe(1);

		// Same requestId: same receipt, no second adapter spawn, no new mint.
		const replay = await runtime.createSession({
			requestId: "req-create-1",
			workspaceId: WORKSPACE,
			agentId: "claude-code",
			title: "My session",
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
		});
		expect(replay).toBe(result);
		expect(port.createCalls).toBe(1);

		await rejectsWith(
			runtime.createSession({
				requestId: "req-create-2",
				workspaceId: WORKSPACE,
				agentId: "codex",
				title: null,
				settings: {
					activeModel: null,
					activeMode: null,
					effort: null,
					configuration: {},
				},
			}),
			"NOT_IMPLEMENTED",
		);
	});

	test("submitTurn: admission receipt, causation, idempotent replay", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");

		const receipt = await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "hello agent" }],
		});
		expect(receipt.status).toBe("accepted");
		expect(port.promptCalls).toBe(1);

		const replay = await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "hello agent" }],
		});
		expect(replay).toBe(receipt);
		expect(port.promptCalls).toBe(1);

		const window = await runtime.getEvents({ sessionId: "session-a" });
		eventsWindowSchema.parse(window);
		const turnStarted = window.items.find(
			(event) => event.payload.type === "turnStarted",
		);
		expect(turnStarted?.causationId).toBe("req-send-1");
		expect(
			turnStarted?.payload.type === "turnStarted"
				? turnStarted.payload.turn.id
				: null,
		).toBe(receipt.turnId);

		// Wrong thread and thought content are rejected before the adapter.
		await rejectsWith(
			runtime.submitTurn({
				requestId: "req-send-2",
				sessionId: "session-a",
				threadId: "thread-elsewhere",
				content: [{ type: "text", text: "x" }],
			}),
			"BAD_REQUEST",
		);
		await rejectsWith(
			runtime.submitTurn({
				requestId: "req-send-3",
				sessionId: "session-a",
				threadId: acpMainThreadId("session-a"),
				content: [{ type: "thought", text: "sneaky" }],
			}),
			"BAD_REQUEST",
		);
	});

	test("turn lifecycle folds into the snapshot: running then idle", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");

		await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "do a thing" }],
		});
		const running = await runtime.getSession({ sessionId: "session-a" });
		sessionSnapshotSchema.parse(running);
		expect(running.session.runState).toBe("running");

		port.emitUpdate("session-a", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "done!" },
			messageId: "acp-msg-1",
		});
		port.completeTurn("session-a", "end_turn");

		const idle = await runtime.getSession({ sessionId: "session-a" });
		sessionSnapshotSchema.parse(idle);
		expect(idle.session.runState).toBe("idle");
		expect(idle.session.eventHead).not.toBeNull();

		const window = await runtime.getEvents({ sessionId: "session-a" });
		expect(window.items.map((event) => event.payload.type)).toContain(
			"turnCompleted",
		);
		for (const event of window.items) {
			sessionEventSchema.parse(event);
		}
	});

	test("permission round-trip: public id in snapshot, resolve maps to native id", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");

		await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "write a file" }],
		});
		port.emitUpdate("session-a", {
			sessionUpdate: "tool_call",
			toolCallId: "toolu_write_1",
			title: "Write config",
			kind: "edit",
			status: "pending",
		});
		port.requestPermission("session-a", "7", "toolu_write_1");

		const snapshot = await runtime.getSession({ sessionId: "session-a" });
		sessionSnapshotSchema.parse(snapshot);
		expect(snapshot.pendingPermissions).toHaveLength(1);
		const pending = snapshot.pendingPermissions[0];
		if (!pending) throw new Error("expected a pending permission");
		expect(pending.toolCallId).toBe("toolu_write_1");
		expect(pending.threadId).toBe(acpMainThreadId("session-a"));

		const receipt = await runtime.resolvePermission({
			requestId: "req-resolve-1",
			sessionId: "session-a",
			permissionId: pending.id,
			outcome: { type: "selected", optionIds: ["allow"] },
		});
		expect(receipt.status).toBe("accepted");
		const respond = port.respondCalls[0];
		if (!respond) throw new Error("expected a respondToPermission call");
		expect(respond.requestId).toBe("7");
		expect(selectedOptionIds(respond.outcome)).toEqual(["allow"]);

		const after = await runtime.getSession({ sessionId: "session-a" });
		expect(after.pendingPermissions).toHaveLength(0);

		// The resolution event carries the resolving request's causation.
		const window = await runtime.getEvents({ sessionId: "session-a" });
		const resolved = window.items.find(
			(event) => event.payload.type === "permissionResolved",
		);
		expect(resolved?.causationId).toBe("req-resolve-1");

		await rejectsWith(
			runtime.resolvePermission({
				requestId: "req-resolve-2",
				sessionId: "session-a",
				permissionId: pending.id,
				outcome: { type: "cancelled" },
			}),
			"NOT_FOUND",
		);
	});

	test("cancelTurn: cancels the active turn, no-ops a finished one, rejects unknown ids", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");

		const receipt = await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "long task" }],
		});
		port.requestPermission("session-a", "9", "toolu_x");

		const cancel = await runtime.cancelTurn({
			requestId: "req-cancel-1",
			sessionId: "session-a",
			turnId: receipt.turnId,
		});
		expect(cancel.status).toBe("accepted");
		expect(port.cancelCalls).toBe(1);

		const snapshot = await runtime.getSession({ sessionId: "session-a" });
		expect(snapshot.session.runState).toBe("idle");
		expect(snapshot.pendingPermissions).toHaveLength(0);

		// Cancelling the already-finished turn again: idempotent admission, no
		// second adapter cancel (receipt replay path).
		const again = await runtime.cancelTurn({
			requestId: "req-cancel-1",
			sessionId: "session-a",
			turnId: receipt.turnId,
		});
		expect(again).toBe(cancel);
		expect(port.cancelCalls).toBe(1);

		// A NEW cancel request against the finished turn admits without touching
		// the adapter.
		const fresh = await runtime.cancelTurn({
			requestId: "req-cancel-2",
			sessionId: "session-a",
			turnId: receipt.turnId,
		});
		expect(fresh.status).toBe("accepted");
		expect(port.cancelCalls).toBe(1);

		await rejectsWith(
			runtime.cancelTurn({
				requestId: "req-cancel-3",
				sessionId: "session-a",
				turnId: "turn-i-made-up",
			}),
			"NOT_FOUND",
		);
	});

	test("updateSession settings drive the config catalog and attribute the settings event", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a", { configOptions: MODEL_OPTIONS });

		const receipt = await runtime.updateSession({
			requestId: "req-model-1",
			sessionId: "session-a",
			settings: { activeModel: "claude-fable-5" },
		});
		expect(receipt).toEqual({
			requestId: "req-model-1",
			sessionId: "session-a",
			status: "accepted",
		});

		const snapshot = await runtime.getSession({ sessionId: "session-a" });
		expect(snapshot.session.settings.activeModel).toBe("claude-fable-5");

		const window = await runtime.getEvents({ sessionId: "session-a" });
		const settingsEvents = window.items.filter(
			(event) => event.payload.type === "settingsUpdated",
		);
		const attributed = settingsEvents.find(
			(event) => event.causationId === "req-model-1",
		);
		expect(attributed).toBeDefined();

		// No effort option in the catalog → unsupported.
		await rejectsWith(
			runtime.updateSession({
				requestId: "req-effort-1",
				sessionId: "session-a",
				settings: { effort: "high" },
			}),
			"NOT_IMPLEMENTED",
		);
	});

	test("getEvents: newest window, backwards paging, thread filter, unknown cursors", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");

		await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "chat" }],
		});
		for (let index = 0; index < 5; index += 1) {
			port.emitUpdate("session-a", {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: `chunk ${index}` },
				messageId: "acp-msg-1",
			});
		}
		port.completeTurn("session-a", "end_turn");

		// No cursor = the newest window (everything here fits one page).
		const all = await runtime.getEvents({ sessionId: "session-a" });
		eventsWindowSchema.parse(all);
		expect(all.items.length).toBeGreaterThan(5);
		expect(all.range.hasMoreBefore).toBe(false);
		expect(all.range.truncatedBefore).toBe(false);
		expect(all.head).toBe(all.range.newest?.cursor ?? "");

		// Paging back from the newest window stitches the log exactly, and
		// hasMoreBefore flips off once the page reaches the log head.
		const pageSize = Math.ceil(all.items.length / 2);
		const newest = await runtime.getEvents({
			sessionId: "session-a",
			limit: pageSize,
		});
		eventsWindowSchema.parse(newest);
		expect(newest.items).toEqual(all.items.slice(-pageSize));
		expect(newest.range.hasMoreBefore).toBe(true);
		const older = await runtime.getEvents({
			sessionId: "session-a",
			beforeCursor: newest.range.oldest?.cursor,
			limit: pageSize,
		});
		eventsWindowSchema.parse(older);
		expect([...older.items, ...newest.items]).toEqual(all.items);
		expect(older.range.hasMoreBefore).toBe(false);
		// Every window reports the same log head, not its own newest item.
		expect(older.head).toBe(all.head);

		// Thread filter restricts items.
		const filtered = await runtime.getEvents({
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
		});
		eventsWindowSchema.parse(filtered);
		expect(
			filtered.items.every(
				(event) => event.threadId === acpMainThreadId("session-a"),
			),
		).toBe(true);

		// An unknown beforeCursor is NOT_FOUND, never a silent empty window.
		await rejectsWith(
			runtime.getEvents({
				sessionId: "session-a",
				beforeCursor: "c999999999999",
			}),
			"NOT_FOUND",
		);
	});

	test("hostSnapshotData mixes tracked (composed) and untracked (synthesized) rows", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-tracked");
		port.seed("session-cold", { title: "cold row" });
		port.seed("session-offline", { status: "offline" });

		await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-tracked",
			threadId: acpMainThreadId("session-tracked"),
			content: [{ type: "text", text: "hi" }],
		});

		const data = runtime.hostSnapshotData();
		expect(data.sessions).toHaveLength(3);
		const byId = new Map(data.sessions.map((session) => [session.id, session]));
		expect(byId.get("session-tracked")?.runState).toBe("running");
		expect(byId.get("session-tracked")?.eventHead).not.toBeNull();
		expect(byId.get("session-cold")?.title).toBe("cold row");
		expect(byId.get("session-cold")?.eventHead).toBeNull();
		expect(byId.get("session-offline")?.runState).toBe("offline");
		// Untracked rows have no permission linkage; the ACP harness resolves
		// every tool host-side.
		expect(data.pendingPermissions).toHaveLength(0);
		expect(data.openClientToolCalls).toHaveLength(0);
	});

	test("offline sessions: passive reads synthesize, live paths resurrect", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		const seeded = port.seed("session-off", { status: "offline" });
		seeded.resurrectFrames = [
			{
				kind: "update",
				update: {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "from before the restart" },
				},
			},
			{
				kind: "update",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "old reply" },
					messageId: "acp-old-1",
				},
			},
		];

		// Passive read: no resurrection, synthesized snapshot with an empty tail.
		const cold = await runtime.getSession({ sessionId: "session-off" });
		sessionSnapshotSchema.parse(cold);
		expect(cold.session.runState).toBe("offline");
		expect(cold.threads).toHaveLength(1);
		expect(cold.session.eventHead).toBeNull();
		expect(cold.recentEvents).toHaveLength(0);
		expect(cold.hasOlderEvents).toBe(false);
		expect(cold.head).toBe("c000000000000");

		// Live path: resurrect, replay the loaded transcript, admit the prompt.
		const receipt = await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-off",
			threadId: acpMainThreadId("session-off"),
			content: [{ type: "text", text: "welcome back" }],
		});
		expect(receipt.status).toBe("accepted");

		const window = await runtime.getEvents({ sessionId: "session-off" });
		const texts = window.items
			.filter((event) => event.payload.type === "messageDelta")
			.map((event) =>
				event.payload.type === "messageDelta" &&
				event.payload.content.type === "text"
					? event.payload.content.text
					: null,
			);
		expect(texts).toContain("from before the restart");
		expect(texts).toContain("old reply");
		expect(texts).toContain("welcome back");

		const live = await runtime.getSession({ sessionId: "session-off" });
		expect(live.session.runState).toBe("running");
	});

	test("updateSession overrides: title, archive, close (and closed blocks prompts)", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");

		const titled = await runtime.updateSession({
			requestId: "req-title-1",
			sessionId: "session-a",
			title: "Renamed",
		});
		expect(titled).toEqual({
			requestId: "req-title-1",
			sessionId: "session-a",
			status: "accepted",
		});
		const renamed = await runtime.getSession({ sessionId: "session-a" });
		expect(renamed.session.title).toBe("Renamed");

		await runtime.updateSession({
			requestId: "req-archive-1",
			sessionId: "session-a",
			archived: true,
		});
		const archived = await runtime.getSession({ sessionId: "session-a" });
		expect(archived.session.archivedAt).not.toBeNull();
		expect(archived.session.title).toBe("Renamed");
		// Archived rows leave the host snapshot scope but stay readable.
		expect(runtime.hostSnapshotData().sessions).toHaveLength(0);

		await runtime.updateSession({
			requestId: "req-close-1",
			sessionId: "session-a",
			closed: true,
		});
		const closed = await runtime.getSession({ sessionId: "session-a" });
		expect(closed.session.closedAt).not.toBeNull();
		expect(closed.session.runState).toBe("closed");

		await rejectsWith(
			runtime.submitTurn({
				requestId: "req-send-1",
				sessionId: "session-a",
				threadId: acpMainThreadId("session-a"),
				content: [{ type: "text", text: "hi" }],
			}),
			"PRECONDITION_FAILED",
		);

		await runtime.updateSession({
			requestId: "req-open-1",
			sessionId: "session-a",
			closed: false,
		});
		const reopened = await runtime.getSession({ sessionId: "session-a" });
		expect(reopened.session.closedAt).toBeNull();
		const receipt = await runtime.submitTurn({
			requestId: "req-send-2",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "hi again" }],
		});
		expect(receipt.status).toBe("accepted");
	});

	test("subagent threads surface in the snapshot; client tool resolution is refused", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");

		await runtime.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "spawn a subagent" }],
		});
		port.emitUpdate("session-a", {
			sessionUpdate: "tool_call",
			toolCallId: "toolu_task_1",
			title: "Explore",
			kind: "execute",
			status: "in_progress",
			_meta: { claudeCode: { toolName: "Task" } },
		});
		port.emitUpdate("session-a", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "child says hi" },
			messageId: "acp-child-1",
			_meta: { claudeCode: { parentToolUseId: "toolu_task_1" } },
		});

		const snapshot = await runtime.getSession({ sessionId: "session-a" });
		sessionSnapshotSchema.parse(snapshot);
		expect(snapshot.threads.map((thread) => thread.kind).sort()).toEqual([
			"main",
			"subagent",
		]);
		const subagent = snapshot.threads.find(
			(thread) => thread.kind === "subagent",
		);
		if (!subagent) throw new Error("expected a subagent thread");
		expect(subagent.parentThreadId).toBe(acpMainThreadId("session-a"));

		// The ACP harness resolves every tool host-side: a live host tool call
		// refuses client resolution, unknown ids are NOT_FOUND.
		await rejectsWith(
			runtime.resolveToolCall({
				requestId: "req-rtc-1",
				sessionId: "session-a",
				toolCallId: "toolu_task_1",
				outcome: { type: "cancelled", reason: null },
			}),
			"PRECONDITION_FAILED",
		);
		await rejectsWith(
			runtime.resolveToolCall({
				requestId: "req-rtc-2",
				sessionId: "session-a",
				toolCallId: "toolu_unknown",
				outcome: { type: "cancelled", reason: null },
			}),
			"NOT_FOUND",
		);
	});

	test("unknown session ids propagate the manager error on every surface", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		let thrown: unknown = null;
		try {
			await runtime.getSession({ sessionId: "session-ghost" });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(Error);
		expect(String(thrown)).toContain("session-ghost");
	});

	test("receipts: reusing a requestId with a different payload is a CONFLICT, never an alias", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");
		port.seed("session-b");

		const receipt = await runtime.submitTurn({
			requestId: "req-shared",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "hello" }],
		});
		expect(receipt.status).toBe("accepted");

		// Same requestId pointed at another session must not replay A's turn
		// receipt as if B's submission succeeded.
		await rejectsWith(
			runtime.submitTurn({
				requestId: "req-shared",
				sessionId: "session-b",
				threadId: acpMainThreadId("session-b"),
				content: [{ type: "text", text: "hello" }],
			}),
			"CONFLICT",
		);

		// Same requestId, same session, different content: also a conflict.
		await rejectsWith(
			runtime.submitTurn({
				requestId: "req-shared",
				sessionId: "session-a",
				threadId: acpMainThreadId("session-a"),
				content: [{ type: "text", text: "something else" }],
			}),
			"CONFLICT",
		);
		expect(port.promptCalls).toBe(1);
	});

	test("receipts: concurrent duplicates join the in-flight call instead of double-executing", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);

		const input = {
			requestId: "req-create-race",
			workspaceId: WORKSPACE,
			agentId: "claude-code",
			title: null,
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
		};
		const [first, second] = await Promise.all([
			runtime.createSession(input),
			runtime.createSession(input),
		]);
		expect(port.createCalls).toBe(1);
		expect(second).toBe(first);
	});

	test("receipts: a failed admission is forgotten so the same requestId can retry", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);

		const input = {
			requestId: "req-create-retry",
			workspaceId: WORKSPACE,
			agentId: "codex",
			title: null,
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
		};
		await rejectsWith(runtime.createSession(input), "NOT_IMPLEMENTED");

		// The failure was not cached as a poisoned receipt, and the changed
		// payload is not a CONFLICT because the failed entry is gone.
		const retried = await runtime.createSession({
			...input,
			agentId: "claude-code",
		});
		expect(retried.session.id).toBe("session-minted-1");
	});

	test("evicted journal head surfaces as truncatedBefore once the window hits the oldest retained event", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");
		// History the host will never see: journaled and evicted before the
		// runtime ever tracks the session.
		for (let index = 0; index < 4; index += 1) {
			port.emitUpdate("session-a", {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: `lost ${index}` },
			});
		}
		port.evictJournal("session-a");

		// First touch subscribes from seq 0, receives the journal's reset
		// frame, and re-attaches live with an empty log.
		const before = await runtime.getEvents({ sessionId: "session-a" });
		eventsWindowSchema.parse(before);
		expect(before.items).toHaveLength(0);
		expect(before.range.hasMoreBefore).toBe(false);
		expect(before.range.truncatedBefore).toBe(true);

		// Life goes on after the hole: new frames land in the canonical log.
		port.emitUpdate("session-a", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "after the hole" },
		});
		const after = await runtime.getEvents({ sessionId: "session-a" });
		eventsWindowSchema.parse(after);
		expect(after.items.length).toBeGreaterThan(1);
		expect(after.range.hasMoreBefore).toBe(false);
		expect(after.range.truncatedBefore).toBe(true);

		// A window that hasn't paged back to the oldest retained event keeps
		// the flag off — there is still local history to fetch first.
		const tail = await runtime.getEvents({ sessionId: "session-a", limit: 1 });
		expect(tail.range.hasMoreBefore).toBe(true);
		expect(tail.range.truncatedBefore).toBe(false);
	});

	test("intact history keeps truncatedBefore off even at the very first event", async () => {
		const port = new FakeAcpPort();
		const runtime = makeRuntime(port);
		port.seed("session-a");
		port.emitUpdate("session-a", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "complete history" },
		});

		const window = await runtime.getEvents({ sessionId: "session-a" });
		eventsWindowSchema.parse(window);
		expect(window.items.length).toBeGreaterThan(0);
		expect(window.range.hasMoreBefore).toBe(false);
		expect(window.range.truncatedBefore).toBe(false);
	});
});
