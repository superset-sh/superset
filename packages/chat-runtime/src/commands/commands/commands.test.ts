import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { deriveTimeline, emptySnapshot, reduceMany } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import { FakeHarness } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import { agentMessage, turn } from "../../testing/fixtures";
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
			{ kind: "turn", turn: turn("t1") },
			{ kind: "item", item: agentMessage("a1", "done"), turnId: "t1" },
			{
				kind: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ kind: "session", session: { status: "idle" } },
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

	test("rewindSession opens a session holding the transcript before a message, with the handoff out of view", async () => {
		const later = Date.now() + 60_000;
		const scriptedTurn = (turnId: string, text: string) => [
			{ kind: "turn" as const, turn: turn(turnId, { startedAtMs: later }) },
			{
				kind: "item" as const,
				item: { ...agentMessage(`${turnId}-reply`, text), startedAtMs: later },
				turnId,
			},
			{
				kind: "turn" as const,
				turn: turn(turnId, {
					status: "completed",
					startedAtMs: later,
					completedAtMs: later,
				}),
			},
			{ kind: "session" as const, session: { status: "idle" as const } },
		];
		const scripts: FakeHarnessScript[] = [
			{ turns: [scriptedTurn("t1", "one"), scriptedTurn("t2", "two")] },
			{ turns: [scriptedTurn("t3", "got it")] },
		];
		let created = 0;
		const runtime = createTestRuntime({
			harnesses: new Map([
				[FAKE_HARNESS, () => new FakeHarness(scripts[created++] ?? { turns: [] })],
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
		).toEqual([{ type: "text", text: "first" }, "t1-reply"]);
		const handoff = envelopes.find(
			(envelope) =>
				envelope.event.type === "item" &&
				envelope.event.item.kind === "user_message" &&
				(envelope.event.item as UserMessage).hidden === true,
		);
		expect(handoff).toBeDefined();
		await runtime.dispose();
	});
});
