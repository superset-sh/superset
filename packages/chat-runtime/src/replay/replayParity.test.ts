import { describe, expect, test } from "bun:test";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type {
	DurableEnvelope,
	DurableEvent,
	SessionState,
} from "@superset/chat/protocol";
import { durableEventSchema } from "@superset/chat/protocol";
import type { AdapterEvent } from "../harness";
import { FakeHarness, type FakeHarnessScript } from "../harness/fake";
import {
	agentMessage,
	approvalRequest,
	reasoning,
	sessionState,
	toolCall,
	turn,
	userMessage,
} from "../testing/fixtures";
import { createTestRuntime } from "../testing/testRuntime";
import { readSince } from "./replay";

const SESSION = "session-1";

const SCRIPT: FakeHarnessScript = {
	start: [{ kind: "session", session: { status: "idle", title: "Fixtures" } }],
	turns: [
		[
			{ kind: "item", item: userMessage("u1", "run ls"), turnId: "t1" },
			{ kind: "turn", turn: turn("t1") },
			{ kind: "item", item: reasoning("r1", "thinking"), turnId: "t1" },
			{ kind: "delta", delta: { type: "text", itemId: "a1", append: "par" } },
			{ kind: "item", item: toolCall("c1"), turnId: "t1" },
			{ kind: "item", item: approvalRequest("ap1"), turnId: "t1" },
			{
				kind: "item",
				item: toolCall("c1", {
					status: "completed",
					content: [{ type: "terminal", command: "ls", output: "a\nb\n" }],
				}),
				turnId: "t1",
			},
			{ kind: "delta", delta: { type: "text", itemId: "a1", append: "tial" } },
			{
				kind: "item",
				item: agentMessage("a1", "listed two files"),
				turnId: "t1",
			},
			{
				kind: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 5 }),
			},
		],
	],
};

function serialize(snapshot: ReturnType<typeof emptySnapshot>): string {
	return JSON.stringify({
		session: snapshot.session,
		turns: [...snapshot.turns].sort(([a], [b]) => a.localeCompare(b)),
		items: [...snapshot.items].sort(([a], [b]) => a.localeCompare(b)),
		liveStreams: [...snapshot.liveStreams].sort(([a], [b]) =>
			a.localeCompare(b),
		),
		cursor: snapshot.cursor,
		pendingReset: snapshot.pendingReset,
	});
}

function toDurableEvent(
	event: AdapterEvent,
	session: SessionState,
): { event: DurableEvent; session: SessionState } | null {
	switch (event.kind) {
		case "item":
			return {
				event: { type: "item", item: event.item, turnId: event.turnId },
				session,
			};
		case "turn":
			return { event: { type: "turn", turn: event.turn }, session };
		case "session": {
			const merged = { ...session, ...event.session };
			return { event: { type: "session", session: merged }, session: merged };
		}
		case "delta":
			return null;
	}
}

async function drain(
	iterator: AsyncIterator<AdapterEvent>,
	count: number,
	onEvent: (event: AdapterEvent) => void,
): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		const result = await iterator.next();
		if (result.done) return;
		onEvent(result.value);
	}
}

describe("journal replay parity", () => {
	test("replaying the journal folds to the same snapshot as the live stream", async () => {
		const runtime = createTestRuntime();
		const opened = runtime.journal.open({
			sessionId: SESSION,
			scopeId: "workspace-1",
			harness: "fake",
		});

		const live: DurableEnvelope[] = [];
		let session = sessionState({ status: "starting" });
		const handle = (event: AdapterEvent) => {
			const mapped = toDurableEvent(event, session);
			if (!mapped) return;
			session = mapped.session;
			const cursor = runtime.journal.append(SESSION, mapped.event);
			live.push({
				v: 1,
				sessionId: SESSION,
				cursor,
				ts: Date.now(),
				event: durableEventSchema.parse(mapped.event),
			});
		};

		const harness = new FakeHarness(SCRIPT);
		const iterator = harness.start({ cwd: "/tmp" })[Symbol.asyncIterator]();
		await drain(iterator, 1, handle);
		harness.prompt([{ type: "text", text: "run ls" }]);
		await drain(iterator, 6, handle);
		harness.respondToApproval("ap1", { type: "accept" });
		await drain(iterator, 5, handle);
		await harness.dispose();

		const replay = readSince(runtime.db, SESSION, {
			epoch: opened.epoch,
			seq: 0,
		});
		expect(replay.ok).toBe(true);
		if (!replay.ok) return;

		expect(replay.envelopes.map((envelope) => envelope.event)).toEqual(
			live.map((envelope) => envelope.event),
		);
		expect(serialize(reduceMany(emptySnapshot(), replay.envelopes))).toBe(
			serialize(reduceMany(emptySnapshot(), live)),
		);

		const snapshot = reduceMany(emptySnapshot(), replay.envelopes);
		expect(snapshot.cursor).toEqual({ epoch: opened.epoch, seq: live.length });
		expect(snapshot.items.get("ap1")?.item).toMatchObject({
			status: "answered",
		});
		expect(snapshot.liveStreams.size).toBe(0);
		expect(runtime.sessions.get(SESSION)).toMatchObject({
			status: "idle",
			title: "Fixtures",
		});
		await runtime.dispose();
	});
});
