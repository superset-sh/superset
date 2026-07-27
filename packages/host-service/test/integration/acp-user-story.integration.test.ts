/**
 * The E2E User Story validator, execution 1 of 4: the full gym story from
 * plans/host-sessions-sync.md driven against the SHIPPING ACP surface
 * (AcpSessionManager) with a real Claude instance. The same story must later
 * pass unchanged over sessions.* + /sessions/sync, over the direct Claude SDK
 * adapter, and finally from a real phone via Maestro.
 *
 * Steps 2-17 of the story run here as sequential tests sharing one session,
 * exactly like a user driving one chat. Steps 18-20 (reconnect, host restart,
 * phone) need surfaces that do not exist yet and are tracked in the rollout
 * doc. Gated because it needs a Claude login and spends real tokens:
 *
 *   ACP_E2E=1 bun test test/integration/acp-user-story.integration.test.ts
 *
 * The story pins opus for instruction-following; override with
 * ACP_E2E_STORY_MODEL / ACP_E2E_STORY_EFFORT when iterating cheaply.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import {
	emptyTimeline,
	foldEnvelopes,
	type SessionUpdateEnvelope,
} from "@superset/session-protocol";
import { AcpSessionManager } from "../../src/runtime/acp-sessions";
import {
	GYM_SCRIPT_SENTINEL,
	GYM_SKILL_SENTINEL,
	GYM_WORKFLOW_NAME,
	provisionGym,
} from "../helpers/gym";

const RUN = process.env.ACP_E2E === "1";
const STORY_MODEL = process.env.ACP_E2E_STORY_MODEL ?? "opus";
const STORY_EFFORT =
	process.env.ACP_E2E_STORY_EFFORT ?? process.env.ACP_E2E_EFFORT ?? "low";

/** Verbatim from plans/host-sessions-sync.md, "The first message". */
const FIRST_MESSAGE = `You are a real Claude instance running inside an automated end-to-end test of
Superset's session harness. This workspace is a disposable "gym" repo created
for this run; nothing in it is real product code. The test exercises the
harness around you: streaming, interrupts, permissions, questions, subagents,
workflows, skills. Follow every instruction in this conversation literally and
minimally, use exactly the tools named, and reply with the exact sentinels
requested. Start now: write a continuous ~600-word tour of this repository in
plain prose, using no tools, and end with the line TOUR_DONE.`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
		}
		await sleep(250);
	}
}

type Turn = Promise<{ stopReason: string }>;

describe.skipIf(!RUN)("E2E user story over the shipping ACP surface", () => {
	let manager: AcpSessionManager;
	let gymDir: string;
	const sessionId = "acp-story-main";
	const workspaceId = "acp-story-workspace";
	const envelopes: SessionUpdateEnvelope[] = [];
	let unsubscribeMain: (() => void) | undefined;

	/** Streaming text accumulated from agent_message_chunk frames. */
	function chunkText(items: SessionUpdateEnvelope[]): string {
		let text = "";
		for (const envelope of items) {
			if (envelope.frame.kind !== "update") continue;
			const update = envelope.frame.update as {
				sessionUpdate?: string;
				content?: { type?: string; text?: string };
			};
			if (update.sessionUpdate !== "agent_message_chunk") continue;
			if (update.content?.type === "text" && update.content.text) {
				text += update.content.text;
			}
		}
		return text;
	}

	/** Full agent text folded from the live since-0 subscription. */
	function agentText(): string {
		const timeline = foldEnvelopes(emptyTimeline(), envelopes);
		return timeline.items
			.filter((item) => item.kind === "message" && item.role === "agent")
			.flatMap((item) => (item.kind === "message" ? item.blocks : []))
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("");
	}

	const lastSeq = () => envelopes.at(-1)?.seq ?? 0;

	const permissionRequestsSince = (seq: number) =>
		envelopes.filter(
			(envelope) =>
				envelope.seq > seq && envelope.frame.kind === "permission_requested",
		).length;

	/** Tool names of tool_call frames emitted after the given seq. */
	const toolCallNamesSince = (seq: number) =>
		envelopes.flatMap((envelope) => {
			if (envelope.seq <= seq || envelope.frame.kind !== "update") return [];
			if (envelope.frame.update.sessionUpdate !== "tool_call") return [];
			const meta = envelope.frame.update._meta as
				| { claudeCode?: { toolName?: string } }
				| undefined;
			return meta?.claudeCode?.toolName ? [meta.claudeCode.toolName] : [];
		});

	/** Await the turn; fail fast if any permission card appears. */
	async function expectNoCardTurn(
		turn: Turn,
		timeoutMs = 240_000,
	): Promise<{ stopReason: string }> {
		const deadline = Date.now() + timeoutMs;
		while (true) {
			const raced = await Promise.race([
				turn.then((result) => ({ done: true as const, result })),
				sleep(300).then(() => ({ done: false as const })),
			]);
			if (raced.done) return raced.result;
			const pending = manager.get(sessionId).pendingPermissions;
			if (pending.length > 0) {
				throw new Error(
					`unexpected permission card during a no-card turn: ${pending[0]?.toolCall.title}`,
				);
			}
			if (Date.now() > deadline) {
				throw new Error(`no-card turn did not finish within ${timeoutMs}ms`);
			}
		}
	}

	/** Await the turn, answering every permission card with allow-once. */
	async function settleTurnAllowingCards(
		turn: Turn,
		timeoutMs = 240_000,
	): Promise<{ stopReason: string }> {
		const answered = new Set<string>();
		const deadline = Date.now() + timeoutMs;
		while (true) {
			const raced = await Promise.race([
				turn.then((result) => ({ done: true as const, result })),
				sleep(300).then(() => ({ done: false as const })),
			]);
			if (raced.done) return raced.result;
			for (const pending of manager.get(sessionId).pendingPermissions) {
				if (answered.has(pending.requestId)) continue;
				const allow =
					pending.options.find((option) => option.kind === "allow_once") ??
					pending.options[0];
				if (!allow) throw new Error("permission card offered no options");
				manager.respondToPermission({
					sessionId,
					requestId: pending.requestId,
					outcome: { outcome: "selected", optionId: allow.optionId },
				});
				answered.add(pending.requestId);
			}
			if (Date.now() > deadline) {
				throw new Error(`turn did not settle within ${timeoutMs}ms`);
			}
		}
	}

	async function pinModel(targetSessionId: string): Promise<void> {
		const model = manager
			.get(targetSessionId)
			.configOptions.find(
				(option) => option.id === "model" && option.type === "select",
			);
		if (
			!model ||
			!model.options.some((option) => option.value === STORY_MODEL)
		) {
			throw new Error(
				`story model ${STORY_MODEL} is unavailable; adapter offered ${model?.options.map((option) => option.value).join(", ") ?? "no model catalog"}`,
			);
		}
		await manager.setConfigOption({
			sessionId: targetSessionId,
			configId: "model",
			value: STORY_MODEL,
		});
		const effort = manager
			.get(targetSessionId)
			.configOptions.find(
				(option) => option.id === "effort" && option.type === "select",
			);
		if (effort?.options.some((option) => option.value === STORY_EFFORT)) {
			await manager.setConfigOption({
				sessionId: targetSessionId,
				configId: "effort",
				value: STORY_EFFORT,
			});
		}
	}

	beforeAll(async () => {
		gymDir = provisionGym("acp-story-");
		manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => gymDir,
		});
		// Story step 2: the session starts in default mode (never bypass) with
		// the model pinned before the first message.
		await manager.create({ sessionId, workspaceId });
		expect(manager.get(sessionId).currentMode?.currentModeId).toBe("default");
		await pinModel(sessionId);
		unsubscribeMain = manager.subscribe({
			sessionId,
			since: 0,
			onEnvelope: (envelope) => envelopes.push(envelope),
		});
	});

	afterAll(async () => {
		unsubscribeMain?.();
		await manager?.dispose();
		if (gymDir) {
			try {
				rmSync(gymDir, { recursive: true, force: true });
			} catch {
				// best-effort
			}
		}
	});

	test("steps 2-5: first message streams, Stop interrupts mid-tour, continue reaches TOUR_DONE", async () => {
		const { accepted, turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: FIRST_MESSAGE }],
		});
		expect(accepted).toBe(true);

		// Step 3: the tour streams live. Step 4: Stop while text is still
		// arriving, well before a ~600-word essay can complete.
		await waitFor(
			() => chunkText(envelopes).length > 300,
			120_000,
			"the tour to start streaming",
		);
		expect(chunkText(envelopes)).not.toContain("TOUR_DONE");
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");

		const interrupted = manager.get(sessionId);
		expect(interrupted.status).toBe("idle");
		expect(interrupted.lastStopReason).toBe("cancelled");
		expect(interrupted.pendingPermissions).toEqual([]);
		const partial = agentText();
		expect(partial.length).toBeGreaterThan(0);
		expect(partial).not.toContain("TOUR_DONE");

		// Step 5: a bare "continue" resumes with context intact.
		const resume = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "continue" }],
		});
		expect((await expectNoCardTurn(resume.turn)).stopReason).toBe("end_turn");
		expect(agentText()).toContain("TOUR_DONE");
	}, 300_000);

	test("steps 6-7: Bash raises a card, allow-once runs it, double answer is already_resolved", async () => {
		const before = agentText().length;
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Run exactly `sh scripts/ok.sh` with the Bash tool exactly once, then reply with exactly RUN_OK followed by the script's output. Do not use any other tool.",
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"the Bash permission card",
		);
		expect(manager.get(sessionId).status).toBe("awaiting_permission");
		const pending = manager.get(sessionId).pendingPermissions[0];
		if (!pending) throw new Error("Bash permission disappeared");
		// A normal tool card offers allow-once, always-allow, and reject.
		const kinds = pending.options.map((option) => option.kind);
		expect(kinds).toContain("allow_once");
		expect(kinds).toContain("allow_always");
		expect(kinds).toContain("reject_once");

		const allow = pending.options.find(
			(option) => option.kind === "allow_once",
		);
		if (!allow) throw new Error("no allow_once option");
		const first = manager.respondToPermission({
			sessionId,
			requestId: pending.requestId,
			outcome: { outcome: "selected", optionId: allow.optionId },
		});
		// Step 7: tapping Allow twice — the second tap is a no-op.
		const second = manager.respondToPermission({
			sessionId,
			requestId: pending.requestId,
			outcome: { outcome: "selected", optionId: allow.optionId },
		});
		expect(first.status).toBe("resolved");
		expect(second.status).toBe("already_resolved");

		expect((await turn).stopReason).toBe("end_turn");
		const reply = agentText().slice(before);
		expect(reply).toContain("RUN_OK");
		expect(reply).toContain(GYM_SCRIPT_SENTINEL);
	}, 300_000);

	test("steps 8-9: always-allow persists — the same command reruns with zero new cards", async () => {
		// Step 8: run again, answer with always-allow this time.
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Run exactly `sh scripts/ok.sh` with the Bash tool exactly once more, then reply with exactly RUN_OK followed by the script's output. Do not use any other tool.",
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"the second Bash permission card",
		);
		const pending = manager.get(sessionId).pendingPermissions[0];
		if (!pending) throw new Error("second Bash permission disappeared");
		const always = pending.options.find(
			(option) => option.kind === "allow_always",
		);
		if (!always) throw new Error("no allow_always option");
		manager.respondToPermission({
			sessionId,
			requestId: pending.requestId,
			outcome: { outcome: "selected", optionId: always.optionId },
		});
		expect((await turn).stopReason).toBe("end_turn");

		// Step 9: the rule holds for the rest of the session — two more runs,
		// no card ever appears.
		const marker = lastSeq();
		const before = agentText().length;
		const rerun = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Run exactly `sh scripts/ok.sh` with the Bash tool exactly twice, one call after the other, then reply with exactly RUN_TWICE_OK. Do not use any other tool.",
				},
			],
		});
		expect((await expectNoCardTurn(rerun.turn)).stopReason).toBe("end_turn");
		expect(permissionRequestsSince(marker)).toBe(0);
		expect(agentText().slice(before)).toContain("RUN_TWICE_OK");
	}, 300_000);

	test("steps 10-11: an edit raises a fresh card; Stop + acceptEdits + continue finishes without one", async () => {
		// Step 10: always-allow was per-tool — a file edit still cards.
		const marker = lastSeq();
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: 'Change the title of README.md to "Gym" using a file editing tool, then reply with exactly EDIT_DONE. Do not use the Bash tool.',
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"the edit permission card",
		);
		const editToolNames = toolCallNamesSince(marker);
		expect(editToolNames.some((name) => ["Edit", "Write"].includes(name))).toBe(
			true,
		);
		expect(editToolNames).not.toContain("Bash");

		// Step 11: Stop instead of answering, switch to an auto-accepting mode,
		// then continue — the edit completes with no card.
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);

		await manager.setMode({ sessionId, modeId: "acceptEdits" });
		expect(manager.get(sessionId).currentMode?.currentModeId).toBe(
			"acceptEdits",
		);

		const resumeMarker = lastSeq();
		const before = agentText().length;
		// A bare "continue" is ambiguous after a rejected edit — real Claude
		// sometimes waits for direction instead of retrying. Be explicit that the
		// mode change means the edit should be applied now.
		const resume = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: 'Continue: I switched this session to acceptEdits mode, so apply that README.md title change to "Gym" now, then reply with exactly EDIT_DONE. Do not use the Bash tool.',
				},
			],
		});
		expect((await expectNoCardTurn(resume.turn)).stopReason).toBe("end_turn");
		expect(permissionRequestsSince(resumeMarker)).toBe(0);
		expect(agentText().slice(before)).toContain("EDIT_DONE");

		// The end state is on disk, not just in the transcript.
		const readme = readFileSync(path.join(gymDir, "README.md"), "utf8");
		expect(readme).toMatch(/^# Gym\s*$/m);
		expect(readme).not.toContain("Gym fixture");
	}, 300_000);

	test("steps 12-13: two questions arrive as sequential cards; answer one, skip the other", async () => {
		const marker = lastSeq();
		const before = agentText().length;
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: 'Use the AskUserQuestion tool exactly once with two questions. Question one: "Pick a color" with exactly two options, red and blue. Question two: "Pick a number" with exactly two options, 1 and 2. Do not answer them yourself. After receiving the answers, reply with exactly ANSWERS followed by the answers you received.',
				},
			],
		});

		// The first question surfaces alone; the second only after it resolves.
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			120_000,
			"the first question card",
		);
		const colorCard = manager.get(sessionId).pendingPermissions[0];
		if (!colorCard) throw new Error("color question disappeared");
		expect(colorCard.toolCall.title).toContain("Pick a color");
		const optionNames = colorCard.options.map((option) => option.name);
		expect(optionNames).toContain("red");
		expect(optionNames).toContain("blue");
		expect(optionNames).toContain("Skip");
		const blue = colorCard.options.find((option) => option.name === "blue");
		if (!blue) throw new Error("blue option missing");
		manager.respondToPermission({
			sessionId,
			requestId: colorCard.requestId,
			outcome: { outcome: "selected", optionId: blue.optionId },
		});

		await waitFor(
			() => {
				const pending = manager.get(sessionId).pendingPermissions;
				return (
					pending.length > 0 && pending[0]?.requestId !== colorCard.requestId
				);
			},
			120_000,
			"the second question card",
		);
		const numberCard = manager.get(sessionId).pendingPermissions[0];
		if (!numberCard) throw new Error("number question disappeared");
		expect(numberCard.toolCall.title).toContain("Pick a number");
		const skip =
			numberCard.options.find((option) => option.name === "Skip") ??
			numberCard.options.find((option) => option.optionId === "skip");
		if (!skip) throw new Error("Skip option missing");
		manager.respondToPermission({
			sessionId,
			requestId: numberCard.requestId,
			outcome: { outcome: "selected", optionId: skip.optionId },
		});

		expect((await turn).stopReason).toBe("end_turn");
		const reply = agentText().slice(before);
		expect(reply).toContain("ANSWERS");
		expect(reply).toContain("blue");
		// Exactly one card per question crossed the wire — no dupes, no extras.
		expect(permissionRequestsSince(marker)).toBe(2);
	}, 300_000);

	test("step 14: a Task subagent reads the fixture and reports through the main thread", async () => {
		const marker = lastSeq();
		const before = agentText().length;
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Launch exactly one subagent that reads notes.txt and reports the expected_sum value. Then reply with exactly SUB_OK followed by that value.",
				},
			],
		});
		expect((await settleTurnAllowingCards(turn, 300_000)).stopReason).toBe(
			"end_turn",
		);
		// The subagent tool is named Task or Agent depending on SDK version.
		const subagentCalls = toolCallNamesSince(marker).filter((name) =>
			["Task", "Agent"].includes(name),
		);
		expect(subagentCalls.length).toBeGreaterThan(0);
		expect(agentText().slice(before)).toContain("SUB_OK 42");
	}, 300_000);

	test("step 15: the saved gym workflow launches, runs its five agents, and verifies", async () => {
		const before = agentText().length;
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: `Launch the named workflow ${GYM_WORKFLOW_NAME} exactly once with the Workflow tool. Do not perform its work yourself and do not use another tool. The Workflow tool runs asynchronously; after it confirms the background launch, reply with exactly WORKFLOW_LAUNCHED and do not cancel it.`,
				},
			],
		});
		expect((await settleTurnAllowingCards(turn, 300_000)).stopReason).toBe(
			"end_turn",
		);
		expect(agentText().slice(before)).toContain("WORKFLOW_LAUNCHED");

		type WorkflowLaunch = {
			status?: string;
			runId?: string;
			transcriptDir?: string;
			workflowName?: string;
		};
		const launch = envelopes
			.flatMap((envelope): WorkflowLaunch[] => {
				if (
					envelope.frame.kind !== "update" ||
					envelope.frame.update.sessionUpdate !== "tool_call_update"
				) {
					return [];
				}
				const meta = envelope.frame.update._meta as
					| { claudeCode?: { toolResponse?: WorkflowLaunch } }
					| undefined;
				const response = meta?.claudeCode?.toolResponse;
				return response?.status === "async_launched" ? [response] : [];
			})
			.at(-1);
		if (!launch?.runId || !launch.transcriptDir) {
			throw new Error("Workflow launch metadata did not cross ACP");
		}
		expect(launch.workflowName).toBe(GYM_WORKFLOW_NAME);

		type WorkflowRunState = {
			status?: string;
			agentCount?: number;
			result?: { verified?: { valid?: boolean; marker?: string } };
		};
		const runStatePath = path.resolve(
			launch.transcriptDir,
			"..",
			"..",
			"..",
			"workflows",
			`${launch.runId}.json`,
		);
		let runState: WorkflowRunState | null = null;
		await waitFor(
			() => {
				if (!existsSync(runStatePath)) return false;
				try {
					runState = JSON.parse(
						readFileSync(runStatePath, "utf8"),
					) as WorkflowRunState;
				} catch {
					return false;
				}
				if (["failed", "killed", "cancelled"].includes(runState.status ?? "")) {
					throw new Error(
						`Workflow run did not complete: ${readFileSync(runStatePath, "utf8")}`,
					);
				}
				return runState.status === "completed";
			},
			240_000,
			"the gym workflow agents to complete",
		);
		if (!runState) throw new Error("Workflow completed without run state");
		const finished = runState as WorkflowRunState;
		expect(finished.agentCount).toBe(5);
		expect(finished.result?.verified?.valid).toBe(true);
		expect(finished.result?.verified?.marker).toBe("WORKFLOW_VERIFIED");
	}, 600_000);

	test("step 16: the project gym-check skill runs and reports its sentinel", async () => {
		const marker = lastSeq();
		const before = agentText().length;
		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Use the Skill tool to run the gym-check skill from this repository, then follow the skill's instructions exactly.",
				},
			],
		});
		expect((await settleTurnAllowingCards(turn, 300_000)).stopReason).toBe(
			"end_turn",
		);
		expect(toolCallNamesSince(marker)).toContain("Skill");
		expect(agentText().slice(before)).toContain(GYM_SKILL_SENTINEL);
	}, 300_000);

	test("step 17: a second session streams in parallel with no envelope bleed", async () => {
		// Keep the main session busy with a long no-tools turn...
		const essayStart = chunkText(envelopes).length;
		const essay = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Write a continuous ~500-word essay about training gyms in plain prose, using no tools, and end with the line ESSAY_DONE.",
				},
			],
		});
		await waitFor(
			() => chunkText(envelopes).length > essayStart + 100,
			120_000,
			"the essay to start streaming",
		);

		// ...then run a whole second session start-to-finish while it streams.
		const secondId = "acp-story-second";
		await manager.create({ sessionId: secondId, workspaceId });
		await pinModel(secondId);
		const secondEnvelopes: SessionUpdateEnvelope[] = [];
		const unsubscribeSecond = manager.subscribe({
			sessionId: secondId,
			since: 0,
			onEnvelope: (envelope) => secondEnvelopes.push(envelope),
		});

		let overlapped = false;
		let secondDone = false;
		const overlapWatch = (async () => {
			while (!secondDone) {
				if (manager.get(sessionId).status === "running") overlapped = true;
				await sleep(200);
			}
		})();
		const second = manager.prompt({
			sessionId: secondId,
			prompt: [
				{
					type: "text",
					text: "Reply with exactly PARALLEL_OK and nothing else.",
				},
			],
		});
		expect((await second.turn).stopReason).toBe("end_turn");
		secondDone = true;
		await overlapWatch;
		expect(overlapped).toBe(true);

		// Each subscription carries only its own session's story.
		expect(chunkText(secondEnvelopes)).toContain("PARALLEL_OK");
		expect(chunkText(secondEnvelopes)).not.toContain("ESSAY_DONE");
		expect(secondEnvelopes[0]?.seq).toBe(1);
		unsubscribeSecond();

		expect((await expectNoCardTurn(essay.turn)).stopReason).toBe("end_turn");
		expect(chunkText(envelopes)).toContain("ESSAY_DONE");
		expect(chunkText(envelopes)).not.toContain("PARALLEL_OK");
	}, 300_000);

	test("the whole story streamed as one gapless envelope sequence", () => {
		expect(envelopes.length).toBeGreaterThan(0);
		expect(envelopes[0]?.seq).toBe(1);
		for (let i = 1; i < envelopes.length; i += 1) {
			expect(envelopes[i]?.seq).toBe((envelopes[i - 1]?.seq ?? 0) + 1);
		}
		const state = manager.get(sessionId);
		expect(state.status).toBe("idle");
		expect(state.pendingPermissions).toEqual([]);
	});
});
