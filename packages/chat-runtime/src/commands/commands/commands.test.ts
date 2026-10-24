import { describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { deriveTimeline, emptySnapshot, reduceMany } from "@superset/chat/core";
import { type UserMessage, wrapHiddenText } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import { FakeHarness } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import { SubagentItems } from "../../stream";
import { agentMessage, turn, userMessage } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	FAKE_HARNESS,
	fakeHarnessRegistry,
	journalEnvelopes,
	waitFor,
} from "../../testing/testUtils";

const SCRIPT: FakeHarnessScript = {
	turns: [
		[
			{ type: "turn", turn: turn("t1") },
			{ type: "item", item: agentMessage("a1", "done"), turnId: "t1" },
			{
				type: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ type: "session", session: { status: "idle" } },
		],
	],
};

function newRuntime(): { runtime: ChatRuntime; adapterCount: () => number } {
	const { harnesses, adapters } = fakeHarnessRegistry(SCRIPT);
	return {
		runtime: createTestRuntime({ harnesses }),
		adapterCount: () => adapters.length,
	};
}

function createSession(runtime: ChatRuntime, scopeId = "workspace-1") {
	return runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId,
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
}

describe("chat commands", () => {
	test("closeSession reports the session's workspace once its agent stops", async () => {
		const { harnesses } = fakeHarnessRegistry(SCRIPT);
		const scopes: string[] = [];
		const runtime = createTestRuntime({
			harnesses,
			onSessionChanged: ({ scopeId }) => {
				scopes.push(scopeId);
			},
		});
		const created = createSession(runtime, "workspace-2");
		scopes.length = 0;

		await runtime.commands.closeSession({ sessionId: created.sessionId });
		await runtime.commands.closeSession({ sessionId: created.sessionId });

		expect(scopes).toEqual(["workspace-2"]);
		await runtime.dispose();
	});

	test("closing a session drops its cached subagent tree", async () => {
		const forget = spyOn(SubagentItems.prototype, "forget");
		try {
			const { runtime } = newRuntime();
			const created = createSession(runtime);
			await runtime.commands.closeSession({ sessionId: created.sessionId });
			expect(forget).toHaveBeenCalledWith(created.sessionId);
			await runtime.dispose();
		} finally {
			forget.mockRestore();
		}
	});

	test("createSession opens a journal and starts the harness", async () => {
		const { runtime, adapterCount } = newRuntime();
		const created = createSession(runtime);

		expect(created.sessionId).toMatch(/^[0-9a-f-]{36}$/);
		expect(adapterCount()).toBe(1);
		expect(runtime.sessions.get(created.sessionId)).toMatchObject({
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			epoch: created.epoch,
		});
		await runtime.dispose();
	});

	test("a duplicate commandId replays the result instead of acting twice", async () => {
		const { runtime, adapterCount } = newRuntime();
		const commandId = randomUUID();
		const first = runtime.commands.createSession({
			commandId,
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});
		const second = runtime.commands.createSession({
			commandId,
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		expect(second).toEqual(first);
		expect(adapterCount()).toBe(1);
		expect(runtime.commands.listSessions({})).toHaveLength(1);

		const promptCommandId = randomUUID();
		const input = {
			commandId: promptCommandId,
			sessionId: first.sessionId,
			clientId: "client-1",
			content: [{ type: "text" as const, text: "hello" }],
		};
		const promptResult = runtime.commands.prompt(input);
		const retried = runtime.commands.prompt(input);
		expect(retried).toEqual(promptResult);

		await waitFor(
			() => runtime.sessions.get(first.sessionId)?.status === "idle",
		);
		const userMessages = journalEnvelopes(runtime, first.sessionId).filter(
			(envelope) =>
				envelope.event.type === "item" &&
				envelope.event.item.kind === "user_message",
		);
		expect(
			new Set(
				userMessages.map((envelope) =>
					envelope.event.type === "item" ? envelope.event.item.id : "",
				),
			).size,
		).toBe(1);
		await runtime.dispose();
	});

	test("rejects an unknown harness", async () => {
		const { runtime } = newRuntime();
		expect(() =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: "nope",
				cwd: "/tmp/workspace",
			}),
		).toThrow("unknown harness nope");
		await runtime.dispose();
	});

	test("rejects input that fails the protocol command schema", async () => {
		const { runtime } = newRuntime();
		const created = createSession(runtime);
		expect(() =>
			runtime.commands.prompt({
				commandId: "not-a-uuid",
				sessionId: created.sessionId,
				clientId: "client-1",
				content: [{ type: "text", text: "hi" }],
			}),
		).toThrow();
		expect(() =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId: created.sessionId,
				clientId: "client-1",
				content: [],
			}),
		).toThrow();
		await runtime.dispose();
	});

	test("prompting a session that is not running throws", async () => {
		const { runtime } = newRuntime();
		expect(() =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId: "missing",
				clientId: "client-1",
				content: [{ type: "text", text: "hi" }],
			}),
		).toThrow("chat session missing is not running");
		await runtime.dispose();
	});

	test("getSession returns the projection row and the current cursor", async () => {
		const { runtime } = newRuntime();
		const created = createSession(runtime);
		const result = runtime.commands.getSession({
			sessionId: created.sessionId,
		});

		expect(result.session).toMatchObject({ sessionId: created.sessionId });
		expect(result.cursor).toEqual({
			epoch: created.epoch,
			seq: runtime.journal.cursor(created.sessionId).seq,
		});
		expect(runtime.commands.getSession({ sessionId: "missing" })).toEqual({
			session: null,
			cursor: null,
			live: false,
		});
		// A running session reports its process; the row alone cannot say so.
		expect(
			runtime.commands.getSession({ sessionId: created.sessionId }).live,
		).toBe(true);
		await runtime.dispose();
	});

	test("listSessions filters by workspace and honours the limit", async () => {
		const { runtime } = newRuntime();
		createSession(runtime, "workspace-1");
		createSession(runtime, "workspace-2");

		expect(runtime.commands.listSessions({})).toHaveLength(2);
		expect(
			runtime.commands.listSessions({ scopeId: "workspace-2" }),
		).toHaveLength(1);
		expect(runtime.commands.listSessions({ limit: 1 })).toHaveLength(1);
		await runtime.dispose();
	});

	test("listSessions reports which sessions are live and their terminal", async () => {
		const { runtime } = newRuntime();
		const withTerminal = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
			terminalId: "terminal-1",
		});
		const closed = createSession(runtime);
		await runtime.commands.closeSession({ sessionId: closed.sessionId });

		const byId = new Map(
			runtime.commands
				.listSessions({})
				.map((session) => [session.sessionId, session]),
		);
		expect(byId.get(withTerminal.sessionId)).toMatchObject({
			live: true,
			terminalId: "terminal-1",
		});
		expect(byId.get(closed.sessionId)).toMatchObject({
			live: false,
			terminalId: null,
		});
		await runtime.dispose();
	});

	test("getItems pages the spine backwards", async () => {
		const { runtime } = newRuntime();
		const created = createSession(runtime);
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: created.sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(
			() => runtime.sessions.get(created.sessionId)?.status === "idle",
		);

		const newest = runtime.commands.getItems({
			sessionId: created.sessionId,
			limit: 2,
		});
		expect(newest.ok).toBe(true);
		if (!newest.ok) return;
		expect(newest.envelopes).toHaveLength(2);
		expect(newest.nextBefore).not.toBeNull();

		const older = runtime.commands.getItems({
			sessionId: created.sessionId,
			before: newest.nextBefore ?? undefined,
			limit: 2,
		});
		if (!older.ok) return;
		expect(older.envelopes.at(-1)?.cursor.seq).toBe(
			(newest.nextBefore?.seq ?? 0) - 1,
		);
		await runtime.dispose();
	});

	test("getOutline returns the whole session and getItemBodies its items by id", async () => {
		const { runtime } = newRuntime();
		const created = createSession(runtime);
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: created.sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(
			() => runtime.sessions.get(created.sessionId)?.status === "idle",
		);

		const outline = runtime.commands.getOutline({
			sessionId: created.sessionId,
		});
		expect(outline.ok).toBe(true);
		if (!outline.ok) return;
		expect(outline.outline.items.map(({ item }) => item.kind)).toEqual([
			"user_message",
			"agent_message",
		]);
		expect(outline.outline.turns.map((turn) => turn.id)).toEqual(["t1"]);
		expect(outline.outline.cursor).not.toBeNull();

		const bodies = runtime.commands.getItemBodies({
			sessionId: created.sessionId,
			itemIds: ["a1", "missing"],
		});
		expect(bodies.ok && bodies.items.map(({ item }) => item.id)).toEqual([
			"a1",
		]);
		expect(runtime.commands.getOutline({ sessionId: "missing" })).toEqual({
			ok: false,
			reset: "session_not_found",
		});
		await runtime.dispose();
	});

	test("rewindSession sends the edited message with the earlier conversation hidden in the same prompt", async () => {
		const later = Date.now() + 60_000;
		const scriptedTurn = (turnId: string, text: string) => [
			{ type: "turn" as const, turn: turn(turnId, { startedAtMs: later }) },
			{
				type: "item" as const,
				item: { ...agentMessage(`${turnId}-reply`, text), startedAtMs: later },
				turnId,
			},
			{
				type: "turn" as const,
				turn: turn(turnId, {
					status: "completed",
					startedAtMs: later,
					completedAtMs: later,
				}),
			},
			{ type: "session" as const, session: { status: "idle" as const } },
		];
		const scripts: FakeHarnessScript[] = [
			{ turns: [scriptedTurn("t1", "one"), scriptedTurn("t2", "two")] },
			{ turns: [scriptedTurn("t3", "got it")] },
		];
		let created = 0;
		const sent: unknown[] = [];
		class RecordingHarness extends FakeHarness {
			override prompt(content: Parameters<FakeHarness["prompt"]>[0]) {
				sent.push(content);
				return super.prompt(content);
			}
		}
		const runtime = createTestRuntime({
			harnesses: new Map([
				[
					FAKE_HARNESS,
					() => new RecordingHarness(scripts[created++] ?? { turns: [] }),
				],
			]),
		});
		const { sessionId } = createSession(runtime);
		const send = (text: string) =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId,
				clientId: text,
				content: [{ type: "text", text }],
			});
		send("first");
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
		const second = send("second");
		await waitFor(
			() =>
				runtime.live.require(sessionId).turn?.id === "t2" &&
				runtime.live.require(sessionId).turn?.status === "completed",
		);

		const rewound = await runtime.commands.rewindSession({
			commandId: randomUUID(),
			sessionId,
			itemId: second.itemId,
			prompt: "second, edited",
			handoffPrompt: "earlier conversation",
			cwd: "/tmp/workspace",
		});
		await waitFor(
			() =>
				runtime.live.require(rewound.sessionId).turn?.status === "completed",
		);

		const envelopes = journalEnvelopes(runtime, rewound.sessionId);
		const shown = deriveTimeline(
			reduceMany(emptySnapshot(), envelopes),
		).flatMap((group) =>
			group.entries.flatMap((entry) =>
				entry.kind === "item" ? [entry.item] : entry.items,
			),
		);
		expect(
			shown.map((item) =>
				item.kind === "user_message"
					? (item as UserMessage).content[0]
					: item.id,
			),
		).toEqual([
			{ type: "text", text: "first" },
			"t1-reply",
			{ type: "text", text: "second, edited" },
			"t3-reply",
		]);
		expect(sent.at(-1)).toEqual([
			{ type: "text", text: wrapHiddenText("earlier conversation") },
			{ type: "text", text: "second, edited" },
		]);
		await runtime.dispose();
	});

	test("rewindSession resumes an agent that can fork at a message, cut there, without a handoff", async () => {
		const later = Date.now() + 60_000;
		const reply = (turnId: string, messageId: string) => [
			{ type: "turn" as const, turn: turn(turnId, { startedAtMs: later }) },
			{
				type: "item" as const,
				item: {
					...agentMessage(`${turnId}-reply`, "done"),
					startedAtMs: later,
					agentMessageId: messageId,
				},
				turnId,
			},
			{
				type: "turn" as const,
				turn: turn(turnId, {
					status: "completed",
					startedAtMs: later,
					completedAtMs: later,
				}),
			},
			{ type: "session" as const, session: { status: "idle" as const } },
		];
		const cuts: (string | undefined)[] = [];
		const resumes: unknown[] = [];
		const sent: unknown[] = [];
		class CuttingHarness extends FakeHarness {
			override start(options: Parameters<FakeHarness["start"]>[0]) {
				resumes.push(options.resume);
				return super.start(options);
			}
			override prompt(content: Parameters<FakeHarness["prompt"]>[0]) {
				sent.push(content);
				return super.prompt(content);
			}
			async fork(cut?: { upToMessageId: string }) {
				cuts.push(cut?.upToMessageId);
				return "agent-forked";
			}
		}
		const runtime = createTestRuntime({
			harnesses: new Map([
				[
					FAKE_HARNESS,
					() =>
						new CuttingHarness({
							turns: [reply("t1", "msg_1"), reply("t2", "msg_2")],
						}),
				],
			]),
		});
		const { sessionId } = createSession(runtime);
		const send = (text: string) =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId,
				clientId: text,
				content: [{ type: "text", text }],
			});
		send("first");
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
		const second = send("second");
		await waitFor(
			() =>
				runtime.live.require(sessionId).turn?.id === "t2" &&
				runtime.live.require(sessionId).turn?.status === "completed",
		);

		const request = {
			commandId: randomUUID(),
			sessionId,
			itemId: second.itemId,
			prompt: "second, edited",
			handoffPrompt: "earlier conversation",
			cwd: "/tmp/workspace",
		};
		const rewound = await runtime.commands.rewindSession(request);
		const retried = await runtime.commands.rewindSession(request);

		expect(retried.sessionId).toBe(rewound.sessionId);
		expect(cuts).toEqual(["msg_1"]);
		expect(resumes.at(-1)).toEqual({
			harnessSessionId: "agent-forked",
			quiet: true,
		});
		await waitFor(() => sent.length === 3);
		expect(sent.at(-1)).toEqual([{ type: "text", text: "second, edited" }]);
		const envelopes = journalEnvelopes(runtime, rewound.sessionId);
		expect(
			deriveTimeline(reduceMany(emptySnapshot(), envelopes)).map(
				(group) => group.turnId,
			),
		).toContain("t1");
		await runtime.dispose();
	});

	test("forkSession gives the branch the terminal it asks for, so the source keeps its own", async () => {
		class ForkingHarness extends FakeHarness {
			async fork() {
				return "agent-forked";
			}
		}
		const runtime = createTestRuntime({
			harnesses: new Map([[FAKE_HARNESS, () => new ForkingHarness(SCRIPT)]]),
		});
		const source = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
			terminalId: "terminal-source",
		});

		const forked = await runtime.commands.forkSession({
			commandId: randomUUID(),
			sessionId: source.sessionId,
			cwd: "/tmp/workspace",
			terminalId: "terminal-branch",
		});

		expect(forked).not.toBeNull();
		expect(runtime.live.require(forked?.sessionId ?? "").terminalId).toBe(
			"terminal-branch",
		);
		expect(runtime.live.require(source.sessionId).terminalId).toBe(
			"terminal-source",
		);
		await runtime.dispose();
	});

	test("rewindSession hands over a message sent into a running turn instead of forking", async () => {
		const cuts: (string | undefined)[] = [];
		class CuttingHarness extends FakeHarness {
			async fork(cut?: { upToMessageId: string }) {
				cuts.push(cut?.upToMessageId);
				return "agent-forked";
			}
		}
		const runtime = createTestRuntime({
			harnesses: new Map([
				[
					FAKE_HARNESS,
					() =>
						new CuttingHarness({
							turns: [
								[
									{ type: "turn", turn: turn("t9") },
									{
										type: "turn",
										turn: turn("t9", { status: "completed" }),
									},
									{ type: "session", session: { status: "idle" } },
								],
							],
						}),
				],
			]),
		});
		const { sessionId } = createSession(runtime);
		const done = turn("t1", { status: "completed", completedAtMs: 2 });
		runtime.live.require(sessionId).seed([
			{ type: "turn", turn: turn("t1") },
			{ type: "item", item: userMessage("u1", "first"), turnId: "t1" },
			{
				type: "item",
				item: { ...agentMessage("a1", "working"), agentMessageId: "msg_1" },
				turnId: "t1",
			},
			{ type: "item", item: userMessage("u2", "steer"), turnId: "t1" },
			{ type: "turn", turn: done },
		]);

		await runtime.commands.rewindSession({
			commandId: randomUUID(),
			sessionId,
			itemId: "u2",
			prompt: "second, edited",
			handoffPrompt: "earlier conversation",
			cwd: "/tmp/workspace",
		});

		expect(cuts).toEqual([]);
		await runtime.dispose();
	});

	test("rewindSession forks at the main agent's message, not a subagent's", async () => {
		const cuts: (string | undefined)[] = [];
		class CuttingHarness extends FakeHarness {
			async fork(cut?: { upToMessageId: string }) {
				cuts.push(cut?.upToMessageId);
				return "agent-forked";
			}
		}
		const runtime = createTestRuntime({
			harnesses: new Map([
				[
					FAKE_HARNESS,
					() =>
						new CuttingHarness({
							turns: [
								[
									{ type: "turn", turn: turn("t9") },
									{
										type: "turn",
										turn: turn("t9", { status: "completed" }),
									},
									{ type: "session", session: { status: "idle" } },
								],
							],
						}),
				],
			]),
		});
		const { sessionId } = createSession(runtime);
		runtime.live.require(sessionId).seed([
			{ type: "turn", turn: turn("t1") },
			{ type: "item", item: userMessage("u1", "first"), turnId: "t1" },
			{
				type: "item",
				item: { ...agentMessage("a1", "working"), agentMessageId: "msg_1" },
				turnId: "t1",
			},
			{
				type: "item",
				item: {
					...agentMessage("sub:child:a1", "child reply"),
					parentItemId: "subagent:child",
					agentMessageId: "child_msg_1",
				},
				turnId: "t1",
			},
			{
				type: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ type: "turn", turn: turn("t2", { startedAtMs: 3 }) },
			{ type: "item", item: userMessage("u2", "second"), turnId: "t2" },
			{
				type: "turn",
				turn: turn("t2", {
					status: "completed",
					startedAtMs: 3,
					completedAtMs: 4,
				}),
			},
		]);

		await runtime.commands.rewindSession({
			commandId: randomUUID(),
			sessionId,
			itemId: "u2",
			prompt: "second, edited",
			handoffPrompt: "earlier conversation",
			cwd: "/tmp/workspace",
		});

		expect(cuts).toEqual(["msg_1"]);
		await runtime.dispose();
	});

	test("rewindSession closes the session it opened when setting it up fails", async () => {
		const reply = [
			{ type: "turn" as const, turn: turn("t1") },
			{
				type: "item" as const,
				item: agentMessage("t1-reply", "hi"),
				turnId: "t1",
			},
			{
				type: "turn" as const,
				turn: turn("t1", { status: "completed" }),
			},
			{ type: "session" as const, session: { status: "idle" as const } },
		];
		let created = 0;
		class UnreachableHarness extends FakeHarness {
			override prompt(content: Parameters<FakeHarness["prompt"]>[0]) {
				if (created > 1) throw new Error("agent unreachable");
				return super.prompt(content);
			}
		}
		const runtime = createTestRuntime({
			harnesses: new Map([
				[
					FAKE_HARNESS,
					() => {
						created += 1;
						return new UnreachableHarness({ turns: [reply] });
					},
				],
			]),
		});
		const { sessionId } = createSession(runtime);
		const sent = runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		await expect(
			runtime.commands.rewindSession({
				commandId: randomUUID(),
				sessionId,
				itemId: sent.itemId,
				prompt: "second, edited",
				handoffPrompt: "earlier conversation",
				cwd: "/tmp/workspace",
			}),
		).rejects.toThrow("agent unreachable");
		const opened = runtime.commands
			.listSessions({})
			.filter((session) => session.sessionId !== sessionId);
		expect(opened).toHaveLength(1);
		expect(runtime.live.get(opened[0]?.sessionId ?? "")).toBeNull();
		await runtime.dispose();
	});

	test("getSession says why a dead session died", async () => {
		const runtime = createTestRuntime({
			harnesses: new Map([
				[
					FAKE_HARNESS,
					() => {
						const adapter = new FakeHarness({ turns: [] });
						adapter.start = async function* () {
							yield* [];
							throw new Error("Authentication required");
						};
						return adapter;
					},
				],
			]),
		});
		const { sessionId } = createSession(runtime);
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "dead");
		expect(runtime.commands.getSession({ sessionId }).lastError).toBe(
			"Authentication required",
		);
		await runtime.dispose();
	});
});
