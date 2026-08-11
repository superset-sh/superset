import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { FakeHarnessScript } from "../../harness/fake";
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
		});
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
});
