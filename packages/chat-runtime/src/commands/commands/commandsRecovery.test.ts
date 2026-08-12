import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { chatJournal } from "../../db";
import type { AdapterEvent, HarnessAdapter } from "../../harness";
import type { HarnessRegistry } from "../../sessions";
import { createTestRuntime } from "../../testing/testRuntime";
import { FAKE_HARNESS, fakeHarnessRegistry } from "../../testing/testUtils";

const HARNESS = "recovery-fake";

function explodingRegistry(): HarnessRegistry {
	return new Map([
		[
			HARNESS,
			(): HarnessAdapter => ({
				start: (): AsyncIterable<AdapterEvent> => {
					throw new Error("spawn failed");
				},
				prompt: () => undefined,
				cancelTurn: () => undefined,
				respondToApproval: () => undefined,
				setMode: () => undefined,
				dispose: async () => undefined,
			}),
		],
	]);
}

describe("createSession failure recovery", () => {
	test("an unknown harness never persists a session row", async () => {
		const { harnesses } = fakeHarnessRegistry({ turns: [] });
		const runtime = createTestRuntime({ harnesses });

		expect(() =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: "nope",
				cwd: "/tmp/workspace",
			}),
		).toThrow(/unknown harness/);
		expect(runtime.sessions.list()).toEqual([]);

		await runtime.dispose();
	});

	test("a harness that fails to start leaves no ghost session or journal rows", async () => {
		const runtime = createTestRuntime({ harnesses: explodingRegistry() });

		expect(() =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: HARNESS,
				cwd: "/tmp/workspace",
			}),
		).toThrow("spawn failed");

		expect(runtime.sessions.list()).toEqual([]);
		expect(runtime.db.select().from(chatJournal).all()).toEqual([]);

		await runtime.dispose();
	});

	test("a retry after a failed create does not accumulate rows", async () => {
		const runtime = createTestRuntime({ harnesses: explodingRegistry() });
		const input = {
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: HARNESS,
			cwd: "/tmp/workspace",
		};

		expect(() => runtime.commands.createSession(input)).toThrow();
		expect(() => runtime.commands.createSession(input)).toThrow();
		expect(runtime.sessions.list()).toEqual([]);

		await runtime.dispose();
	});

	test("the same commandId on two different commands is not deduped", async () => {
		const { harnesses } = fakeHarnessRegistry({ turns: [[]] });
		const runtime = createTestRuntime({ harnesses });
		const commandId = randomUUID();

		const created = runtime.commands.createSession({
			commandId,
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		const prompted = runtime.commands.prompt({
			commandId,
			sessionId: created.sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});

		expect(prompted).toHaveProperty("itemId");
		expect(prompted).not.toHaveProperty("epoch");

		await runtime.dispose();
	});
});

describe("epoch recovery", () => {
	test("a lost journal resets the projection alongside the epoch", async () => {
		const { harnesses } = fakeHarnessRegistry({ turns: [] });
		const runtime = createTestRuntime({ harnesses });
		const { sessionId } = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		runtime.journal.append(sessionId, {
			type: "session",
			session: { status: "running", harness: FAKE_HARNESS, title: "My thread" },
		});
		expect(runtime.sessions.get(sessionId)).toMatchObject({
			status: "running",
			title: "My thread",
		});

		const lost = runtime.journal.cursor(sessionId).epoch;
		runtime.db
			.delete(chatJournal)
			.where(eq(chatJournal.sessionId, sessionId))
			.run();

		const reopened = runtime.journal.open({
			sessionId,
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
		});

		expect(reopened.epoch).not.toBe(lost);
		expect(runtime.sessions.get(sessionId)).toMatchObject({
			status: "starting",
			title: null,
			queuedCount: 0,
		});

		await runtime.dispose();
	});
});
