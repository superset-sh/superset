import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Envelope } from "@superset/chat/protocol";
import { isDeltaEnvelope } from "@superset/chat/protocol";
import type { ChatRuntime } from "../../index";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	createManualSchedule,
	createRecordingSink,
	FAKE_HARNESS,
	fakeHarnessRegistry,
} from "../../testing/testUtils";
import type { Sink } from "./subscriptions";

function startRuntime(schedule?: ReturnType<typeof createManualSchedule>): {
	runtime: ChatRuntime;
	sessionId: string;
} {
	const { harnesses } = fakeHarnessRegistry({ turns: [] });
	const runtime = createTestRuntime({
		harnesses,
		...(schedule ? { schedule: schedule.schedule } : {}),
	});
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId };
}

function durableEnvelope(sessionId: string, epoch: string): Envelope {
	return {
		v: 1,
		sessionId,
		cursor: { epoch, seq: 9_999 },
		ts: 1,
		event: { type: "session", session: { status: "idle", harness: "fake" } },
	};
}

describe("subscription resilience", () => {
	test("a sink that throws is dropped without starving the others", async () => {
		const { runtime, sessionId } = startRuntime();
		const healthy = createRecordingSink();
		let closed = false;
		let alive = true;
		const broken: Sink = {
			send: () => {
				if (!alive) throw new Error("socket is gone");
			},
			close: () => {
				closed = true;
			},
		};

		runtime.subscribe(sessionId, { deltas: [] }, broken);
		runtime.subscribe(sessionId, { deltas: [] }, healthy.sink);
		expect(runtime.subscriptions.subscriberCount(sessionId)).toBe(2);
		alive = false;

		const before = healthy.envelopes.length;
		runtime.subscriptions.publish(
			durableEnvelope(sessionId, runtime.journal.cursor(sessionId).epoch),
		);

		expect(runtime.subscriptions.subscriberCount(sessionId)).toBe(1);
		expect(closed).toBe(true);
		expect(healthy.envelopes.length).toBe(before + 1);

		await runtime.dispose();
	});

	test("a sink that throws during bootstrap never registers", async () => {
		const { runtime, sessionId } = startRuntime();
		const broken: Sink = {
			send: () => {
				throw new Error("socket is gone");
			},
			close: () => undefined,
		};

		runtime.subscribe(sessionId, { deltas: [] }, broken);
		expect(runtime.subscriptions.subscriberCount(sessionId)).toBe(0);

		await runtime.dispose();
	});

	test("deltas published with no subscriber are dropped, not buffered", async () => {
		const manual = createManualSchedule();
		const { runtime, sessionId } = startRuntime(manual);

		runtime.subscriptions.publish({
			v: 1,
			sessionId,
			ts: 1,
			delta: { type: "text", itemId: "a1", append: "orphan" },
		});
		expect(manual.pendingCount()).toBe(0);

		const sink = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: ["text"] }, sink.sink);
		manual.flush();

		expect(sink.envelopes.filter(isDeltaEnvelope)).toEqual([]);

		await runtime.dispose();
	});
});
