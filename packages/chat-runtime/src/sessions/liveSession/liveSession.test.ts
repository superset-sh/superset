import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type { DurableEnvelope, UserMessage } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import {
	agentMessage,
	approvalRequest,
	toolCall,
	turn,
} from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	FAKE_HARNESS,
	fakeHarnessRegistry,
	journalEnvelopes,
	waitFor,
} from "../../testing/testUtils";

function startSession(script: FakeHarnessScript): {
	runtime: ChatRuntime;
	sessionId: string;
} {
	const { harnesses } = fakeHarnessRegistry(script);
	const runtime = createTestRuntime({ harnesses });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId };
}

function sendPrompt(runtime: ChatRuntime, sessionId: string, text: string) {
	return runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId,
		clientId: `client-${text}`,
		content: [{ type: "text", text }],
	});
}

function userMessages(envelopes: DurableEnvelope[]): {
	item: UserMessage;
	turnId: string;
}[] {
	const found: { item: UserMessage; turnId: string }[] = [];
	for (const envelope of envelopes) {
		const event = envelope.event;
		if (event.type !== "item" || event.item.kind !== "user_message") continue;
		found.push({ item: event.item as UserMessage, turnId: event.turnId });
	}
	return found;
}

function sessionStatuses(envelopes: DurableEnvelope[]): string[] {
	return envelopes
		.filter((envelope) => envelope.event.type === "session")
		.map((envelope) =>
			envelope.event.type === "session" ? envelope.event.session.status : "",
		);
}

const SINGLE_TURN: FakeHarnessScript = {
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

describe("LiveSession", () => {
	test("mints the user_message and re-attributes it to the adapter turn", async () => {
		const { runtime, sessionId } = startSession(SINGLE_TURN);
		const result = sendPrompt(runtime, sessionId, "hello");
		expect(result.queued).toBe(false);

		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		const envelopes = journalEnvelopes(runtime, sessionId);
		const prompts = userMessages(envelopes);
		expect(prompts).toHaveLength(2);
		expect(prompts[0]?.item.id).toBe(result.itemId);
		expect(prompts[0]?.item.queued).toBeUndefined();
		expect(prompts[0]?.turnId).not.toBe("t1");
		expect(prompts[1]).toMatchObject({
			turnId: "t1",
			item: { id: result.itemId, clientId: "client-hello" },
		});

		const snapshot = reduceMany(emptySnapshot(), envelopes);
		expect(snapshot.items.get(result.itemId)?.turnId).toBe("t1");
		expect(snapshot.items.size).toBe(2);
		expect(snapshot.session?.status).toBe("idle");
		await runtime.dispose();
	});

	test("queues a prompt while a turn runs and delivers it at the boundary", async () => {
		const { runtime, sessionId } = startSession({
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{
						kind: "turn",
						turn: turn("t1", { status: "completed", completedAtMs: 2 }),
					},
					{ kind: "session", session: { status: "idle" } },
				],
				[
					{ kind: "turn", turn: turn("t2") },
					{ kind: "item", item: agentMessage("a2", "second"), turnId: "t2" },
					{
						kind: "turn",
						turn: turn("t2", { status: "completed", completedAtMs: 4 }),
					},
					{ kind: "session", session: { status: "idle" } },
				],
			],
		});

		const first = sendPrompt(runtime, sessionId, "first");
		const second = sendPrompt(runtime, sessionId, "second");
		expect(first.queued).toBe(false);
		expect(second.queued).toBe(true);
		expect(runtime.sessions.get(sessionId)?.queuedCount).toBe(1);

		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		const envelopes = journalEnvelopes(runtime, sessionId);
		const queuedAppends = userMessages(envelopes).filter(
			(entry) => entry.item.id === second.itemId,
		);
		expect(queuedAppends[0]?.item.queued).toBe(true);
		expect(queuedAppends[0]?.turnId).not.toBe("t2");
		expect(queuedAppends.at(-1)?.item.queued).toBeUndefined();
		expect(queuedAppends.at(-1)?.turnId).toBe("t2");

		expect(sessionStatuses(envelopes)).toEqual(["starting", "running", "idle"]);

		const snapshot = reduceMany(emptySnapshot(), envelopes);
		expect(snapshot.items.get(second.itemId)?.turnId).toBe("t2");
		expect(runtime.sessions.get(sessionId)?.queuedCount).toBe(0);
		await runtime.dispose();
	});

	test("cancelTurn interrupts the turn, cancels tools and stales approvals", async () => {
		const { runtime, sessionId } = startSession({
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{ kind: "item", item: toolCall("c1"), turnId: "t1" },
					{ kind: "item", item: approvalRequest("ap1"), turnId: "t1" },
				],
			],
		});
		sendPrompt(runtime, sessionId, "run it");

		await waitFor(() =>
			journalEnvelopes(runtime, sessionId).some(
				(envelope) =>
					envelope.event.type === "item" && envelope.event.item.id === "ap1",
			),
		);

		runtime.commands.cancelTurn({
			commandId: randomUUID(),
			sessionId,
			turnId: "t1",
		});

		await waitFor(() => {
			const snapshot = reduceMany(
				emptySnapshot(),
				journalEnvelopes(runtime, sessionId),
			);
			return snapshot.turns.get("t1")?.status === "interrupted";
		});

		const snapshot = reduceMany(
			emptySnapshot(),
			journalEnvelopes(runtime, sessionId),
		);
		expect(snapshot.turns.get("t1")?.status).toBe("interrupted");
		expect(snapshot.items.get("c1")?.item).toMatchObject({
			status: "canceled",
		});
		expect(snapshot.items.get("ap1")?.item).toMatchObject({ status: "stale" });
		await runtime.dispose();
	});

	test("cancelTurn for a turn that is no longer running is a no-op", async () => {
		const { runtime, sessionId } = startSession(SINGLE_TURN);
		sendPrompt(runtime, sessionId, "hello");
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		const before = journalEnvelopes(runtime, sessionId).length;
		runtime.commands.cancelTurn({
			commandId: randomUUID(),
			sessionId,
			turnId: "some-other-turn",
		});
		expect(journalEnvelopes(runtime, sessionId)).toHaveLength(before);
		await runtime.dispose();
	});
});
