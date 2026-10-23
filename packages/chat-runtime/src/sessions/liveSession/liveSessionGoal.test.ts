import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type {
	DurableEnvelope,
	Notice,
	UserContent,
} from "@superset/chat/protocol";
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
import { goalBrief, goalContinuation } from "./utils/goal";

function replyTurn(id: string, reply: string): FakeHarnessScript["turns"][0] {
	return [
		{ kind: "turn", turn: turn(id) },
		{ kind: "item", item: agentMessage(`${id}-reply`, reply), turnId: id },
		{
			kind: "turn",
			turn: turn(id, { status: "completed", completedAtMs: 2 }),
		},
		{ kind: "session", session: { status: "idle" } },
	];
}

function startSession(script: FakeHarnessScript) {
	const { harnesses, adapters } = fakeHarnessRegistry(script);
	const runtime = createTestRuntime({ harnesses });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId, adapters };
}

function sendPrompt(runtime: ChatRuntime, sessionId: string, text: string) {
	return runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId,
		clientId: `client-${text}`,
		content: [{ type: "text", text }],
	});
}

function notices(envelopes: DurableEnvelope[]): string[] {
	return envelopes.flatMap((envelope) =>
		envelope.event.type === "item" && envelope.event.item.kind === "notice"
			? [(envelope.event.item as Notice).text ?? ""]
			: [],
	);
}

function promptedTexts(prompted: UserContent[][]): string[] {
	return prompted.map((content) =>
		content.map((part) => (part.type === "text" ? part.text : "")).join(""),
	);
}

describe("LiveSession /goal", () => {
	test("prompts again after each turn until the agent reports the goal reached", async () => {
		const { runtime, sessionId, adapters } = startSession({
			turns: [
				replyTurn("t1", "Wrote the parser."),
				replyTurn("t2", "Added tests.\nGOAL_COMPLETE"),
			],
		});
		const result = sendPrompt(runtime, sessionId, "/goal ship the parser");

		await waitFor(
			() => notices(journalEnvelopes(runtime, sessionId)).length > 0,
		);

		expect(promptedTexts(adapters[0]?.prompted ?? [])).toEqual([
			goalBrief("ship the parser"),
			goalContinuation("ship the parser"),
		]);
		const envelopes = journalEnvelopes(runtime, sessionId);
		expect(notices(envelopes)).toEqual(["Goal reached: ship the parser"]);
		const snapshot = reduceMany(emptySnapshot(), envelopes);
		expect(snapshot.items.get(result.itemId)?.item).toMatchObject({
			content: [{ type: "text", text: "/goal ship the parser" }],
		});
		expect(snapshot.session?.goal).toBeUndefined();
		await runtime.dispose();
	});

	test("ends the goal when the agent reports it is blocked", async () => {
		const { runtime, sessionId, adapters } = startSession({
			turns: [replyTurn("t1", "GOAL_BLOCKED: need a database URL")],
		});
		sendPrompt(runtime, sessionId, "/goal migrate the schema");

		await waitFor(
			() => notices(journalEnvelopes(runtime, sessionId)).length > 0,
		);

		expect(adapters[0]?.prompted).toHaveLength(1);
		expect(notices(journalEnvelopes(runtime, sessionId))).toEqual([
			"Goal blocked: need a database URL",
		]);
		await runtime.dispose();
	});

	test("ends the goal when the user stops the turn", async () => {
		const { runtime, sessionId, adapters } = startSession({
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{
						kind: "turn",
						turn: turn("t1", { status: "interrupted", completedAtMs: 2 }),
					},
					{ kind: "session", session: { status: "idle" } },
				],
			],
		});
		sendPrompt(runtime, sessionId, "/goal refactor the store");

		await waitFor(
			() => notices(journalEnvelopes(runtime, sessionId)).length > 0,
		);

		expect(adapters[0]?.prompted).toHaveLength(1);
		expect(notices(journalEnvelopes(runtime, sessionId))).toEqual([
			"Stopped working on the goal: refactor the store",
		]);
		await runtime.dispose();
	});

	test("shows and clears the goal without prompting the agent", async () => {
		const { runtime, sessionId, adapters } = startSession({ turns: [] });
		sendPrompt(runtime, sessionId, "/goal");
		sendPrompt(runtime, sessionId, "/goal clear");

		expect(adapters[0]?.prompted).toHaveLength(0);
		expect(notices(journalEnvelopes(runtime, sessionId))).toEqual([
			"No goal is set. Type /goal and then a goal to set one.",
			"No goal is set. Type /goal and then a goal to set one.",
		]);
		await runtime.dispose();
	});
});
