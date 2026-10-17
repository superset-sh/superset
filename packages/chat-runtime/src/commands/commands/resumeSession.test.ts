import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { SessionState, UserContent } from "@superset/chat/protocol";
import { FakeHarness } from "../../harness/fake";
import type { HarnessFactoryOptions, HarnessRegistry } from "../../sessions";
import { agentMessage, turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	FAKE_HARNESS,
	journalEnvelopes,
	waitFor,
} from "../../testing/testUtils";

const text = (value: string): UserContent[] => [{ type: "text", text: value }];

function runtimeWithStartedAgents(session: Partial<SessionState> = {}) {
	const started: HarnessFactoryOptions[] = [];
	const harnesses: HarnessRegistry = new Map([
		[
			FAKE_HARNESS,
			(options) => {
				started.push(options);
				return new FakeHarness({
					start: [
						{
							kind: "item",
							item: agentMessage("history", "earlier reply"),
							turnId: "history-turn",
						},
						{
							kind: "session",
							delayMs: 5,
							session: {
								status: "idle",
								harnessSessionId: "agent-1",
								...session,
							},
						},
					],
					turns: [[{ kind: "turn", turn: turn("t1") }], []],
				});
			},
		],
	]);
	return { runtime: createTestRuntime({ harnesses }), started };
}

describe("resuming chats after a restart", () => {
	test("a running turn and the prompts queued behind it are unfinished", async () => {
		const { runtime } = runtimeWithStartedAgents();
		const { sessionId } = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
			terminalId: "terminal-1",
		});
		await waitFor(() => runtime.live.get(sessionId)?.state.status === "idle");
		const live = runtime.live.require(sessionId);
		live.prompt(text("first"), randomUUID());
		await waitFor(() => live.turn?.status === "running");
		live.prompt(text("second"), randomUUID());

		expect(runtime.live.unfinished()).toEqual([
			expect.objectContaining({
				sessionId,
				scopeId: "workspace-1",
				harnessSessionId: "agent-1",
				terminalId: "terminal-1",
				interrupted: true,
				prompts: [text("second")],
				pausedPrompts: [],
			}),
		]);
		await runtime.dispose();
	});

	test("a resumed chat is prompted only after the agent reloads its history", async () => {
		const { runtime } = runtimeWithStartedAgents();
		const { sessionId } = runtime.commands.resumeSession({
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			harnessSessionId: "agent-1",
			cwd: "/tmp/workspace",
			prompts: [text("continue")],
			pausedPrompts: [],
		});
		await waitFor(
			() => runtime.live.get(sessionId)?.turn?.status === "running",
		);

		const kinds = journalEnvelopes(runtime, sessionId).flatMap(({ event }) =>
			event.type === "item" ? [event.item.kind] : [],
		);
		expect(kinds.indexOf("user_message")).toBeGreaterThan(
			kinds.indexOf("agent_message"),
		);
		await runtime.dispose();
	});

	test("a prompt sent while the resumed agent loads waits behind the resume prompts", async () => {
		const { runtime } = runtimeWithStartedAgents();
		const { sessionId } = runtime.commands.resumeSession({
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			harnessSessionId: "agent-1",
			cwd: "/tmp/workspace",
			prompts: [text("continue")],
			pausedPrompts: [],
		});
		const live = runtime.live.require(sessionId);
		expect(live.prompt(text("from the pane"), randomUUID()).queued).toBe(true);
		await waitFor(() => live.turn?.status === "running");

		expect(live.queueState.prompts.map((p) => p.content)).toEqual([
			text("from the pane"),
		]);
		await runtime.dispose();
	});

	test("prompts from a resume whose agent died go to the pane's next attempt", async () => {
		let attempts = 0;
		const harnesses: HarnessRegistry = new Map([
			[
				FAKE_HARNESS,
				() =>
					new FakeHarness({
						start: [
							{
								kind: "session",
								delayMs: 5,
								session:
									++attempts === 1
										? { status: "dead" }
										: { status: "idle", harnessSessionId: "agent-1" },
							},
						],
						turns: [[{ kind: "turn", turn: turn("t1") }]],
					}),
			],
		]);
		const runtime = createTestRuntime({ harnesses });
		const failed = runtime.commands.resumeSession({
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			harnessSessionId: "agent-1",
			terminalId: "terminal-1",
			cwd: "/tmp/workspace",
			prompts: [text("continue")],
			pausedPrompts: [text("held")],
		});
		await waitFor(
			() => runtime.live.get(failed.sessionId)?.state.status === "dead",
		);

		const retried = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
			terminalId: "terminal-1",
			resume: { harnessSessionId: "agent-1" },
		});
		const live = runtime.live.require(retried.sessionId);
		await waitFor(() => live.turn?.status === "running");

		expect(retried.sessionId).not.toBe(failed.sessionId);
		const sent = journalEnvelopes(runtime, retried.sessionId).flatMap(
			({ event }) =>
				event.type === "item" && event.item.kind === "user_message"
					? [event.item.content]
					: [],
		);
		expect(sent).toContainEqual(text("continue"));
		expect(live.queueState).toMatchObject({
			paused: true,
			prompts: [expect.objectContaining({ content: text("held") })],
		});
		await runtime.dispose();
	});

	test("prompts held in a paused queue come back paused", async () => {
		const { runtime } = runtimeWithStartedAgents();
		const { sessionId } = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});
		await waitFor(() => runtime.live.get(sessionId)?.state.status === "idle");
		const live = runtime.live.require(sessionId);
		live.prompt(text("first"), randomUUID());
		await waitFor(() => live.turn?.status === "running");
		live.prompt(text("held"), randomUUID());
		live.cancelTurn(undefined, true);
		await waitFor(() => live.turn?.status === "interrupted");

		expect(live.queueState.paused).toBe(true);
		const [unfinished] = runtime.live.unfinished();
		expect(unfinished).toMatchObject({
			interrupted: false,
			prompts: [],
			pausedPrompts: [text("held")],
		});
		await runtime.dispose();

		const after = runtimeWithStartedAgents();
		const resumed = after.runtime.commands.resumeSession({
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			harnessSessionId: "agent-1",
			cwd: "/tmp/workspace",
			prompts: [],
			pausedPrompts: unfinished?.pausedPrompts ?? [],
		});
		await waitFor(
			() => after.runtime.live.get(resumed.sessionId)?.state.status === "idle",
		);
		const restored = after.runtime.live.require(resumed.sessionId);
		expect(restored.queueState.paused).toBe(true);
		expect(restored.queueState.prompts.map((p) => p.content)).toEqual([
			text("held"),
		]);
		expect(restored.turn).toBeNull();
		await after.runtime.dispose();
	});

	test("an idle chat with a command running in the background is unfinished", async () => {
		const idle = runtimeWithStartedAgents();
		const held = runtimeWithStartedAgents({
			backgroundTasks: [
				{
					id: "task-1",
					kind: "process",
					name: "sleep 90",
					canStop: true,
					startedAtMs: 1,
				},
			],
		});
		const open = (runtime: typeof idle.runtime) => {
			const { sessionId } = runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: FAKE_HARNESS,
				cwd: "/tmp/workspace",
			});
			return waitFor(
				() => runtime.live.get(sessionId)?.state.status === "idle",
			);
		};
		await open(idle.runtime);
		await open(held.runtime);

		expect(idle.runtime.live.unfinished()).toEqual([]);
		expect(held.runtime.live.unfinished()).toEqual([
			expect.objectContaining({ interrupted: true, prompts: [] }),
		]);
		await idle.runtime.dispose();
		await held.runtime.dispose();
	});

	test("a resumed chat is handed to the pane that reattaches to its terminal", async () => {
		const { runtime, started } = runtimeWithStartedAgents();
		const resumed = runtime.commands.resumeSession({
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			harnessSessionId: "agent-1",
			terminalId: "terminal-1",
			cwd: "/tmp/workspace",
			prompts: [text("continue")],
			pausedPrompts: [],
		});
		const reattach = (harnessSessionId: string) =>
			runtime.commands.createSession({
				commandId: randomUUID(),
				scopeId: "workspace-1",
				harness: FAKE_HARNESS,
				cwd: "/tmp/workspace",
				terminalId: "terminal-1",
				resume: { harnessSessionId },
			});

		expect(started[0]?.resume).toEqual({ harnessSessionId: "agent-1" });
		await waitFor(
			() => runtime.live.get(resumed.sessionId)?.turn?.status === "running",
		);
		expect(reattach("agent-forked").sessionId).not.toBe(resumed.sessionId);
		expect(reattach("agent-1")).toEqual(resumed);
		expect(reattach("agent-1").sessionId).not.toBe(resumed.sessionId);
		await runtime.dispose();
	});
});
