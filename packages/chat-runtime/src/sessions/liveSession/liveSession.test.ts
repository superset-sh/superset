import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	deriveQueuedPrompts,
	emptySnapshot,
	reduceMany,
} from "@superset/chat/core";
import type { DurableEnvelope, UserMessage } from "@superset/chat/protocol";
import { isDurableEnvelope } from "@superset/chat/protocol";
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

	test("a queued prompt is counted by the time it is published", async () => {
		const countsAtPublish: number[] = [];
		const { harnesses } = fakeHarnessRegistry({
			turns: [[{ kind: "turn", turn: turn("t1") }]],
		});
		const runtime = createTestRuntime({
			harnesses,
			observer: {
				started: () => {},
				stopped: () => {},
				published: (envelope, session) => {
					if (!isDurableEnvelope(envelope)) return;
					const { event } = envelope;
					if (
						event.type === "item" &&
						event.item.kind === "user_message" &&
						(event.item as UserMessage).queued
					) {
						countsAtPublish.push(session.queuedCount);
					}
				},
			},
		});
		const { sessionId } = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});
		sendPrompt(runtime, sessionId, "first");
		sendPrompt(runtime, sessionId, "second");
		expect(countsAtPublish).toEqual([1]);
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
	const GATED_THEN_QUICK: FakeHarnessScript = {
		turns: [
			[
				{ kind: "turn", turn: turn("t1") },
				{ kind: "item", item: approvalRequest("ap1"), turnId: "t1" },
			],
			[
				{ kind: "turn", turn: turn("t2") },
				{
					kind: "turn",
					turn: turn("t2", { status: "completed", completedAtMs: 4 }),
				},
				{ kind: "session", session: { status: "idle" } },
			],
			[
				{ kind: "turn", turn: turn("t3") },
				{
					kind: "turn",
					turn: turn("t3", { status: "completed", completedAtMs: 6 }),
				},
				{ kind: "session", session: { status: "idle" } },
			],
		],
	};

	async function waitForApproval(runtime: ChatRuntime, sessionId: string) {
		await waitFor(() =>
			journalEnvelopes(runtime, sessionId).some(
				(envelope) =>
					envelope.event.type === "item" && envelope.event.item.id === "ap1",
			),
		);
	}

	test("removeQueuedPrompt drops a queued prompt so it never reaches the agent", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		const second = sendPrompt(runtime, sessionId, "second");
		const third = sendPrompt(runtime, sessionId, "third");

		runtime.commands.removeQueuedPrompt({
			commandId: randomUUID(),
			sessionId,
			itemId: second.itemId,
		});

		const snapshot = reduceMany(
			emptySnapshot(),
			journalEnvelopes(runtime, sessionId),
		);
		expect(snapshot.items.get(second.itemId)?.item).toMatchObject({
			discarded: true,
		});
		expect(deriveQueuedPrompts(snapshot).map((item) => item.id)).toEqual([
			third.itemId,
		]);
		expect(runtime.sessions.get(sessionId)?.queuedCount).toBe(1);
		await runtime.dispose();
	});

	test("steerQueuedPrompt interrupts the turn and delivers that prompt next", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		const second = sendPrompt(runtime, sessionId, "second");
		const third = sendPrompt(runtime, sessionId, "third");

		runtime.commands.steerQueuedPrompt({
			commandId: randomUUID(),
			sessionId,
			itemId: third.itemId,
		});

		await waitFor(() => runtime.sessions.get(sessionId)?.queuedCount === 0);
		await waitFor(() => {
			const snapshot = reduceMany(
				emptySnapshot(),
				journalEnvelopes(runtime, sessionId),
			);
			return snapshot.items.get(second.itemId)?.turnId === "t3";
		});
		const snapshot = reduceMany(
			emptySnapshot(),
			journalEnvelopes(runtime, sessionId),
		);
		expect(snapshot.turns.get("t1")?.status).toBe("interrupted");
		expect(snapshot.items.get(third.itemId)?.turnId).toBe("t2");
		expect(snapshot.items.get(second.itemId)?.turnId).toBe("t3");
		await runtime.dispose();
	});

	test("a prompt sent with steer for the running turn interrupts it and runs next", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		const second = sendPrompt(runtime, sessionId, "second");
		const steered = runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId,
			clientId: "client-steered",
			content: [{ type: "text", text: "steered" }],
			steer: { expectedTurnId: "t1" },
		});

		await waitFor(() => {
			const snapshot = reduceMany(
				emptySnapshot(),
				journalEnvelopes(runtime, sessionId),
			);
			return snapshot.items.get(second.itemId)?.turnId === "t3";
		});
		const snapshot = reduceMany(
			emptySnapshot(),
			journalEnvelopes(runtime, sessionId),
		);
		expect(snapshot.turns.get("t1")?.status).toBe("interrupted");
		expect(snapshot.items.get(steered.itemId)?.turnId).toBe("t2");
		await runtime.dispose();
	});

	test("a prompt sent with steer for a turn that is no longer running only queues", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId,
			clientId: "client-late",
			content: [{ type: "text", text: "late" }],
			steer: { expectedTurnId: "t0" },
		});

		expect(runtime.sessions.get(sessionId)?.queuedCount).toBe(1);
		const snapshot = reduceMany(
			emptySnapshot(),
			journalEnvelopes(runtime, sessionId),
		);
		expect(snapshot.turns.get("t1")?.status).toBe("running");
		await runtime.dispose();
	});

	test("steerQueuedPrompt between turns interrupts the turn that was about to start", async () => {
		const { runtime, sessionId } = startSession({
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{ kind: "item", item: approvalRequest("ap1"), turnId: "t1" },
					{
						kind: "turn",
						turn: turn("t1", { status: "completed", completedAtMs: 2 }),
					},
				],
				[
					{ kind: "turn", turn: turn("t2"), delayMs: 200 },
					{ kind: "item", item: approvalRequest("ap2"), turnId: "t2" },
				],
				[
					{ kind: "turn", turn: turn("t3") },
					{
						kind: "turn",
						turn: turn("t3", { status: "completed", completedAtMs: 6 }),
					},
					{ kind: "session", session: { status: "idle" } },
				],
			],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		sendPrompt(runtime, sessionId, "second");
		const third = sendPrompt(runtime, sessionId, "third");

		runtime.commands.respondToApproval({
			commandId: randomUUID(),
			sessionId,
			approvalId: "ap1",
			decision: { type: "accept" },
		});
		await waitFor(() =>
			journalEnvelopes(runtime, sessionId).some(
				(envelope) =>
					envelope.event.type === "turn" &&
					envelope.event.turn.id === "t1" &&
					envelope.event.turn.status === "completed",
			),
		);
		runtime.commands.steerQueuedPrompt({
			commandId: randomUUID(),
			sessionId,
			itemId: third.itemId,
		});

		await waitFor(() => {
			const snapshot = reduceMany(
				emptySnapshot(),
				journalEnvelopes(runtime, sessionId),
			);
			return snapshot.items.get(third.itemId)?.turnId === "t3";
		});
		const snapshot = reduceMany(
			emptySnapshot(),
			journalEnvelopes(runtime, sessionId),
		);
		expect(snapshot.turns.get("t2")?.status).toBe("interrupted");
		await runtime.dispose();
	});

	test("cancelTurn with pauseQueue pauses the queue until resumeQueue", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		const second = sendPrompt(runtime, sessionId, "second");

		runtime.commands.cancelTurn({
			commandId: randomUUID(),
			sessionId,
			turnId: "t1",
			pauseQueue: true,
		});
		const latest = () =>
			reduceMany(emptySnapshot(), journalEnvelopes(runtime, sessionId));
		await waitFor(() => latest().turns.get("t1")?.status === "interrupted");
		expect(latest().session?.queuePaused).toBe(true);
		expect(deriveQueuedPrompts(latest()).map((item) => item.id)).toEqual([
			second.itemId,
		]);
		expect(runtime.commands.getQueue({ sessionId })).toMatchObject({
			live: true,
			paused: true,
			prompts: [{ itemId: second.itemId, clientId: "client-second" }],
		});

		runtime.commands.resumeQueue({ commandId: randomUUID(), sessionId });
		await waitFor(() => latest().items.get(second.itemId)?.turnId === "t2");
		expect(latest().session?.queuePaused).toBe(false);
		expect(runtime.commands.getQueue({ sessionId })).toMatchObject({
			paused: false,
			prompts: [],
		});
		await runtime.dispose();
	});

	test("steerQueuedPrompt while paused sends that prompt, then resumes the queue", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		const second = sendPrompt(runtime, sessionId, "second");
		const third = sendPrompt(runtime, sessionId, "third");

		runtime.commands.cancelTurn({
			commandId: randomUUID(),
			sessionId,
			turnId: "t1",
			pauseQueue: true,
		});
		const latest = () =>
			reduceMany(emptySnapshot(), journalEnvelopes(runtime, sessionId));
		await waitFor(() => latest().turns.get("t1")?.status === "interrupted");

		runtime.commands.steerQueuedPrompt({
			commandId: randomUUID(),
			sessionId,
			itemId: third.itemId,
		});
		await waitFor(() => latest().items.get(third.itemId)?.turnId === "t2");
		expect(latest().session?.queuePaused).toBe(false);
		await waitFor(() => latest().items.get(second.itemId)?.turnId === "t3");
		await runtime.dispose();
	});

	test("cancelTurn without pauseQueue keeps sending the queue", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		const second = sendPrompt(runtime, sessionId, "second");

		runtime.commands.cancelTurn({
			commandId: randomUUID(),
			sessionId,
			turnId: "t1",
		});
		const latest = () =>
			reduceMany(emptySnapshot(), journalEnvelopes(runtime, sessionId));
		await waitFor(() => latest().items.get(second.itemId)?.turnId === "t2");
		expect(latest().session?.queuePaused).toBeUndefined();
		await runtime.dispose();
	});

	test("a pause right after Steer still sends the steered prompt", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		sendPrompt(runtime, sessionId, "second");
		const third = sendPrompt(runtime, sessionId, "third");

		runtime.commands.steerQueuedPrompt({
			commandId: randomUUID(),
			sessionId,
			itemId: third.itemId,
		});
		runtime.commands.cancelTurn({
			commandId: randomUUID(),
			sessionId,
			turnId: "t1",
			pauseQueue: true,
		});
		const latest = () =>
			reduceMany(emptySnapshot(), journalEnvelopes(runtime, sessionId));
		await waitFor(() => latest().items.get(third.itemId)?.turnId === "t2");
		await runtime.dispose();
	});

	test("closing the session discards the prompts still queued", async () => {
		const { runtime, sessionId } = startSession(GATED_THEN_QUICK);
		sendPrompt(runtime, sessionId, "first");
		await waitForApproval(runtime, sessionId);
		const second = sendPrompt(runtime, sessionId, "second");

		await runtime.commands.closeSession({ sessionId });
		const snapshot = reduceMany(
			emptySnapshot(),
			journalEnvelopes(runtime, sessionId),
		);
		expect(deriveQueuedPrompts(snapshot)).toEqual([]);
		expect(snapshot.items.get(second.itemId)?.item).toMatchObject({
			discarded: true,
		});
		await runtime.dispose();
	});

	test("queue commands reject a prompt that is not queued", async () => {
		const { runtime, sessionId } = startSession(SINGLE_TURN);
		expect(() =>
			runtime.commands.removeQueuedPrompt({
				commandId: randomUUID(),
				sessionId,
				itemId: "missing",
			}),
		).toThrow("prompt missing is not queued");
		await runtime.dispose();
	});
});
