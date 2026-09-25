import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { DurableEnvelope } from "@superset/chat/protocol";
import type { AdapterEvent, HarnessAdapter } from "../../harness";
import { FakeHarness } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import type { HarnessRegistry } from "../../sessions";
import { createTestRuntime } from "../../testing/testRuntime";
import { journalEnvelopes, waitFor } from "../../testing/testUtils";

const HARNESS = "failing";

function registryFor(adapter: HarnessAdapter): HarnessRegistry {
	return new Map([[HARNESS, () => adapter]]);
}

function failingStream(
	events: AdapterEvent[],
	message: string,
): HarnessAdapter {
	return {
		start: () => ({
			async *[Symbol.asyncIterator]() {
				for (const event of events) yield event;
				throw new Error(message);
			},
		}),
		prompt: () => undefined,
		cancelTurn: () => undefined,
		respondToApproval: () => undefined,
		setMode: () => undefined,
		dispose: async () => undefined,
	};
}

class PromptThrows extends FakeHarness {
	prompt(): void {
		throw new Error("prompt rejected");
	}
}

function startSession(adapter: HarnessAdapter): {
	runtime: ChatRuntime;
	sessionId: string;
} {
	const runtime = createTestRuntime({ harnesses: registryFor(adapter) });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId };
}

function statuses(envelopes: DurableEnvelope[]): string[] {
	return envelopes
		.filter((envelope) => envelope.event.type === "session")
		.map((envelope) =>
			envelope.event.type === "session" ? envelope.event.session.status : "",
		);
}

describe("live session adapter failures", () => {
	test("a rejected pump journals the failure instead of going unhandled", async () => {
		const runningTurn: AdapterEvent = {
			kind: "turn",
			turn: { id: "turn-1", status: "running", startedAtMs: 1 },
		};
		const { runtime, sessionId } = startSession(
			failingStream([runningTurn], "stream exploded"),
		);

		await waitFor(() =>
			statuses(journalEnvelopes(runtime, sessionId)).includes("dead"),
		);
		const envelopes = journalEnvelopes(runtime, sessionId);

		const turns = envelopes.flatMap((envelope) =>
			envelope.event.type === "turn" ? [envelope.event.turn] : [],
		);
		expect(turns.at(-1)?.status).toBe("interrupted");

		const notices = envelopes.flatMap((envelope) =>
			envelope.event.type === "item" && envelope.event.item.kind === "notice"
				? [envelope.event.item]
				: [],
		);
		expect(notices.at(-1)).toMatchObject({
			noticeKind: "error",
			text: "stream exploded",
		});

		await runtime.dispose();
	});

	test("a session whose stream died still disposes cleanly", async () => {
		const { runtime, sessionId } = startSession(
			failingStream([], "stream exploded"),
		);
		await waitFor(() =>
			statuses(journalEnvelopes(runtime, sessionId)).includes("dead"),
		);
		await expect(runtime.dispose()).resolves.toBeUndefined();
	});

	test("a throwing prompt does not wedge the queue", async () => {
		const { runtime, sessionId } = startSession(
			new PromptThrows({ turns: [[]] }),
		);

		expect(() =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId,
				clientId: "client-1",
				content: [{ type: "text", text: "first" }],
			}),
		).toThrow("prompt rejected");

		const session = runtime.live.require(sessionId);
		expect(session.queuedCount).toBe(0);

		expect(() =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId,
				clientId: "client-2",
				content: [{ type: "text", text: "second" }],
			}),
		).toThrow("prompt rejected");
		expect(session.queuedCount).toBe(0);

		await runtime.dispose();
	});
});
