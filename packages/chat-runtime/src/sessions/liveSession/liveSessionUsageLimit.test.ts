import { describe, expect, jest, mock, setSystemTime, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setImmediate as flush } from "node:timers/promises";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type { UsageLimitAction, UserMessage } from "@superset/chat/protocol";
import type { HarnessAdapter } from "../../harness";
import { EventQueue } from "../../harness/eventQueue";
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

const REFUSED: FakeHarnessScript["turns"][number] = [
	{ kind: "turn", turn: turn("t1") },
	{ kind: "session", session: { usageLimit: { hitAtMs: 2, resetsAtMs: 50 } } },
	{
		kind: "turn",
		turn: turn("t1", {
			status: "failed",
			error: { message: "error_during_execution" },
			completedAtMs: 2,
		}),
	},
	{ kind: "session", session: { status: "idle" } },
];

const COMPLETED: FakeHarnessScript["turns"][number] = [
	{ kind: "turn", turn: turn("t2") },
	{ kind: "item", item: agentMessage("a2", "done"), turnId: "t2" },
	{ kind: "turn", turn: turn("t2", { status: "completed", completedAtMs: 4 }) },
	{ kind: "session", session: { status: "idle" } },
];

function startSession(
	script: FakeHarnessScript,
	usageLimitGraceMs = 30_000,
): { runtime: ChatRuntime; sessionId: string } {
	const { harnesses } = fakeHarnessRegistry(script);
	const runtime = createTestRuntime({ harnesses, usageLimitGraceMs });
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

function respond(
	runtime: ChatRuntime,
	sessionId: string,
	action: UsageLimitAction,
) {
	runtime.commands.respondToUsageLimit({
		commandId: randomUUID(),
		sessionId,
		action,
	});
}

function snapshot(runtime: ChatRuntime, sessionId: string) {
	return reduceMany(emptySnapshot(), journalEnvelopes(runtime, sessionId));
}

function deliveredTexts(runtime: ChatRuntime, sessionId: string): string[] {
	const seen = new Map<string, UserMessage>();
	for (const envelope of journalEnvelopes(runtime, sessionId)) {
		const event = envelope.event;
		if (event.type === "item" && event.item.kind === "user_message") {
			seen.set(event.item.id, event.item as UserMessage);
		}
	}
	return [...seen.values()]
		.filter((item) => !item.queued && !item.discarded)
		.map((item) =>
			item.content.map((c) => (c.type === "text" ? c.text : "")).join(""),
		);
}

describe("LiveSession usage limit", () => {
	test("a refused turn pauses prompts queued before and after the refusal", async () => {
		const { runtime, sessionId } = startSession({
			turns: [REFUSED, COMPLETED],
		});
		sendPrompt(runtime, sessionId, "first");
		const second = sendPrompt(runtime, sessionId, "second");
		expect(second.queued).toBe(true);
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		expect(snapshot(runtime, sessionId).session?.usageLimit).toEqual({
			hitAtMs: 2,
			resetsAtMs: 50,
		});

		const third = sendPrompt(runtime, sessionId, "third");
		expect(third.queued).toBe(true);
		expect(snapshot(runtime, sessionId).session?.queuePaused).toBe(true);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first"]);
		runtime.live.require(sessionId).removeQueued(third.itemId);

		respond(runtime, sessionId, "resume");
		await waitFor(
			() =>
				snapshot(runtime, sessionId).turns.get("t2")?.status === "completed",
		);
		const session = snapshot(runtime, sessionId).session;
		expect(session?.usageLimit).toBeUndefined();
		expect(session?.queuePaused).toBe(false);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first", "second"]);
		await runtime.dispose();
	});

	test("resuming with nothing queued continues the cut-short work", async () => {
		const { runtime, sessionId } = startSession({
			turns: [REFUSED, COMPLETED],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		respond(runtime, sessionId, "resume");
		await waitFor(
			() =>
				snapshot(runtime, sessionId).turns.get("t2")?.status === "completed",
		);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first", "Continue"]);
		await runtime.dispose();
	});

	test("dismissing drops the notice and leaves the queue paused", async () => {
		const { runtime, sessionId } = startSession({
			turns: [REFUSED, COMPLETED],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		sendPrompt(runtime, sessionId, "second");
		respond(runtime, sessionId, "dismiss");
		const session = snapshot(runtime, sessionId).session;
		expect(session?.usageLimit).toBeUndefined();
		expect(session?.queuePaused).toBe(true);
		expect(deliveredTexts(runtime, sessionId)).toEqual(["first"]);
		await runtime.dispose();
	});

	test("resume at reset can be cancelled and rearmed without waiting for the real clock", async () => {
		jest.useFakeTimers();
		setSystemTime(0);
		const { runtime, session, events, prompt, advance } = timerSession();
		try {
			await flush();
			session.respondToUsageLimit("resume_at_reset");
			expect(session.state.usageLimit?.resumeAtReset).toBe(true);
			session.respondToUsageLimit("cancel_resume_at_reset");
			expect(session.state.usageLimit?.resumeAtReset).toBe(false);
			advance(1_000);
			expect(prompt).not.toHaveBeenCalled();

			session.respondToUsageLimit("resume_at_reset");
			advance(0);
			expect(prompt.mock.calls).toEqual([
				[[{ type: "text", text: "Continue" }]],
			]);
			expect(session.state.usageLimit).toBeUndefined();
		} finally {
			events.close();
			await runtime.dispose();
			jest.useRealTimers();
			setSystemTime();
		}
	});

	test.each([
		"dead event",
		"closed stream",
	] as const)("%s cancels automatic resume and prevents rearming it", async (ending) => {
		jest.useFakeTimers();
		setSystemTime(0);
		const { runtime, session, events, prompt, advance } = timerSession();
		try {
			await flush();
			session.respondToUsageLimit("resume_at_reset");
			expect(jest.getTimerCount()).toBe(1);
			if (ending === "dead event") {
				events.push({ kind: "session", session: { status: "dead" } });
			} else {
				events.close();
			}
			await flush();
			expect(jest.getTimerCount()).toBe(0);
			session.respondToUsageLimit("resume_at_reset");
			session.respondToUsageLimit("resume");
			advance(1_000);
			expect(prompt).not.toHaveBeenCalled();
			expect(jest.getTimerCount()).toBe(0);
		} finally {
			events.close();
			await runtime.dispose();
			jest.useRealTimers();
			setSystemTime();
		}
	});

	test("a failed turn whose error names the limit counts, with no reset time", async () => {
		const { runtime, sessionId } = startSession({
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{
						kind: "turn",
						turn: turn("t1", {
							status: "failed",
							error: { message: "You've hit your usage limit." },
							completedAtMs: 2,
						}),
					},
					{ kind: "session", session: { status: "idle" } },
				],
			],
		});
		sendPrompt(runtime, sessionId, "first");
		await waitFor(
			() => snapshot(runtime, sessionId).session?.usageLimit !== undefined,
		);
		expect(
			snapshot(runtime, sessionId).session?.usageLimit?.resetsAtMs,
		).toBeUndefined();
		await runtime.dispose();
	});
});

function timerSession() {
	let now = 0;
	const events = new EventQueue();
	const prompt = mock<HarnessAdapter["prompt"]>();
	const adapter: HarnessAdapter = {
		start: () => events.iterable(),
		prompt,
		cancelTurn: () => undefined,
		respondToApproval: () => undefined,
		setMode: () => undefined,
		dispose: async () => events.close(),
	};
	const runtime = createTestRuntime({
		harnesses: new Map([[FAKE_HARNESS, () => adapter]]),
		usageLimitGraceMs: 0,
	});
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	events.push({
		kind: "session",
		session: { status: "idle", usageLimit: { hitAtMs: 0, resetsAtMs: 1_000 } },
	});
	return {
		runtime,
		events,
		prompt,
		session: runtime.live.require(sessionId),
		advance: (ms: number) => {
			now += ms;
			setSystemTime(now);
			jest.advanceTimersByTime(ms);
		},
	};
}
