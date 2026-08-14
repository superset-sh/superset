import { describe, expect, test } from "bun:test";
import {
	createTestRuntime,
	FAKE_HARNESS,
	fakeHarnessRegistry,
} from "../../testing";
import { agentMessage, turn } from "../../testing/fixtures";
import { projectTranscriptForHandoff } from "./handoff";

function turnScript(id: string, text: string) {
	return [
		{ kind: "turn" as const, turn: turn(id) },
		{ kind: "item" as const, item: agentMessage(`${id}-a`, text), turnId: id },
		{
			kind: "turn" as const,
			turn: turn(id, { status: "completed" as const, completedAtMs: 2 }),
		},
		{ kind: "session" as const, session: { status: "idle" as const } },
	];
}

function boot() {
	const { harnesses } = fakeHarnessRegistry({
		turns: [
			turnScript("t1", "four"),
			turnScript("t2", "fine"),
			turnScript("t3", "sure"),
		],
	});
	return createTestRuntime({ harnesses });
}

describe("forkSession", () => {
	test("fork inherits scope, records lineage, and seeds the first prompt only", async () => {
		const runtime = boot();
		const created = runtime.commands.createSession({
			commandId: crypto.randomUUID(),
			scopeId: "ws-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/w",
		});
		runtime.commands.prompt({
			commandId: crypto.randomUUID(),
			sessionId: created.sessionId,
			clientId: "c1",
			content: [{ type: "text", text: "what is 2+2" }],
		});
		await Bun.sleep(30);

		const fork = runtime.commands.forkSession({
			commandId: crypto.randomUUID(),
			sessionId: created.sessionId,
			cwd: "/tmp/w",
		});
		const row = runtime.sessions.get(fork.sessionId);
		expect(row?.scopeId).toBe("ws-1");
		expect(row?.forkedFromSessionId).toBe(created.sessionId);

		runtime.commands.prompt({
			commandId: crypto.randomUUID(),
			sessionId: fork.sessionId,
			clientId: "c2",
			content: [{ type: "text", text: "continue" }],
		});
		await Bun.sleep(30);
		const page = runtime.commands.getItems({
			sessionId: fork.sessionId,
			limit: 50,
		});
		if (!page.ok) throw new Error("page not ok");
		const userTexts = page.envelopes
			.filter(
				(e) => e.event.type === "item" && e.event.item.kind === "user_message",
			)
			.map((e) =>
				JSON.stringify(e.event.type === "item" ? e.event.item : null),
			);
		expect(userTexts[0]).toContain("prior_conversation");
		expect(userTexts[0]).toContain("what is 2+2");
		expect(userTexts[0]).toContain("continue");

		runtime.commands.prompt({
			commandId: crypto.randomUUID(),
			sessionId: fork.sessionId,
			clientId: "c3",
			content: [{ type: "text", text: "again" }],
		});
		await Bun.sleep(30);
		const page2 = runtime.commands.getItems({
			sessionId: fork.sessionId,
			limit: 50,
		});
		if (!page2.ok) throw new Error("page2 not ok");
		const seededIds = new Set(
			page2.envelopes
				.filter(
					(e) =>
						e.event.type === "item" &&
						JSON.stringify(e.event.item).includes("prior_conversation"),
				)
				.map((e) => (e.event.type === "item" ? e.event.item.id : "")),
		);
		expect(seededIds.size).toBe(1);
		await runtime.dispose();
	});
});

describe("projectTranscriptForHandoff", () => {
	test("tail-truncates with a marker", () => {
		const events = Array.from({ length: 40 }, (_, i) => ({
			v: 1 as const,
			sessionId: "s",
			ts: i,
			cursor: { epoch: "e", seq: i + 1 },
			event: {
				type: "item" as const,
				turnId: "t",
				item: {
					kind: "agent_message" as const,
					id: `m${i}`,
					text: "x".repeat(2000),
					startedAtMs: i,
				},
			},
		}));
		const out = projectTranscriptForHandoff(events, { maxChars: 5000 });
		expect(out.startsWith("[earlier conversation truncated]")).toBe(true);
		expect(out.length).toBeLessThan(6000);
	});
});
