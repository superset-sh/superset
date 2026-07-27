/**
 * The E2E User Story validator, execution 2 of 4: the same gym story from
 * plans/host-sessions-sync.md (steps 2-17), driven UNCHANGED against the
 * TARGET canonical surface — `sessions.*` tRPC on a real `createApp` host and
 * a real `createSessionsSyncClient` store over a real `/sessions/sync`
 * WebSocket — with a real Claude instance behind the ACP adapter. Execution 1
 * (the shipping ACP surface) is acp-user-story.integration.test.ts; execution
 * 3 re-runs this file over the direct SDK adapter, execution 4 replays it
 * from a phone via Maestro.
 *
 * Because every inbound frame is schema-and-context validated by the client
 * (mismatch force-closes the socket) and the final test asserts zero drops
 * and store/tRPC parity, the whole story doubles as a wire-conformance run.
 *
 * Gated because it needs a Claude login and spends real tokens:
 *
 *   ACP_E2E=1 bun test test/integration/sessions-user-story.integration.test.ts
 *
 * The story pins opus for instruction-following; override with
 * ACP_E2E_STORY_MODEL / ACP_E2E_STORY_EFFORT when iterating cheaply.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import {
	createSessionsSyncClient,
	type SessionsSyncClient,
	type SessionsSyncLogEvent,
} from "@superset/host-service-sync/client";
import {
	SESSIONS_SYNC_PATH,
	type Session,
	type SessionEvent,
	type Thread,
} from "@superset/host-service-sync/protocol";
import { AcpSessionManager } from "../../src/runtime/acp-sessions";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
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

describe.skipIf(!RUN)("E2E user story over sessions.* + /sessions/sync", () => {
	let gymDir: string;
	let manager: AcpSessionManager;
	let host: TestHost;
	let server: ServerType;
	let client: SessionsSyncClient;
	const logs: SessionsSyncLogEvent[] = [];

	let sessionA: Session;
	let mainThreadA: Thread;
	let requestSerial = 0;
	const nextRequestId = () => `req-story-${++requestSerial}`;

	// -------------------------------------------------------------------------
	// Store lenses — everything below reads ONLY what a product client can
	// read: the sync client's folded store and the public tRPC surface.
	// -------------------------------------------------------------------------

	/** Session A's ordered canonical event list, from the client store. */
	function events(): SessionEvent[] {
		const stream = client.store.getState().streamsBySessionId[sessionA.id];
		if (!stream) throw new Error("no client stream for the story session");
		return stream.eventIds.map((id) => {
			const event = stream.eventsById[id];
			if (!event) throw new Error(`client stream lost event ${id}`);
			return event;
		});
	}

	/** Count of events currently folded; used as a progress marker. */
	const marker = () => events().length;

	function sessionEntity(): Session {
		const session = client.store.getState().sessionsById[sessionA.id];
		if (!session) throw new Error("story session missing from client store");
		return session;
	}

	function pendingPermissions(sessionId = sessionA.id) {
		return Object.values(client.store.getState().pendingPermissionsById)
			.filter((pending) => pending.sessionId === sessionId)
			.sort((left, right) => left.requestedAt - right.requestedAt);
	}

	/**
	 * Assistant prose streamed on the MAIN thread: text deltas of assistant
	 * messages, in fold order. Thought blocks and subagent threads excluded.
	 */
	function agentText(items = events()): string {
		const assistantMessages = new Set<string>();
		for (const event of items) {
			if (
				event.payload.type === "messageStarted" &&
				event.payload.message.role === "assistant" &&
				event.threadId === mainThreadA.id
			) {
				assistantMessages.add(event.payload.message.id);
			}
		}
		let text = "";
		for (const event of items) {
			if (event.payload.type !== "messageDelta") continue;
			if (!assistantMessages.has(event.payload.messageId)) continue;
			if (event.payload.content.type !== "text") continue;
			text += event.payload.content.text;
		}
		return text;
	}

	/** Tool names of toolCallStarted events at or after an event marker. */
	const toolNamesSince = (since: number) =>
		events()
			.slice(since)
			.flatMap((event) =>
				event.payload.type === "toolCallStarted"
					? [event.payload.toolCall.tool.name]
					: [],
			);

	const permissionRequestsSince = (since: number) =>
		events()
			.slice(since)
			.filter((event) => event.payload.type === "permissionRequested").length;

	/** Every title this tool call ever carried (started + refinements). */
	function toolCallTitles(toolCallId: string): string[] {
		return events().flatMap((event) => {
			if (
				event.payload.type === "toolCallStarted" &&
				event.payload.toolCall.id === toolCallId
			) {
				return [event.payload.toolCall.title];
			}
			if (
				event.payload.type === "toolCallUpdated" &&
				event.payload.toolCallId === toolCallId &&
				event.payload.update.title !== undefined
			) {
				return [event.payload.update.title];
			}
			return [];
		});
	}

	function turnEnd(
		turnId: string,
	): { kind: "completed"; stopReason: string } | { kind: "cancelled" } | null {
		for (const event of events()) {
			const payload = event.payload;
			if (payload.type === "turnCompleted" && payload.turnId === turnId) {
				return { kind: "completed", stopReason: payload.stopReason };
			}
			if (payload.type === "turnCancelled" && payload.turnId === turnId) {
				return { kind: "cancelled" };
			}
			if (payload.type === "turnFailed" && payload.turnId === turnId) {
				throw new Error(`turn ${turnId} failed: ${payload.error.code}`);
			}
		}
		return null;
	}

	// -------------------------------------------------------------------------
	// Command helpers — all writes go through the public tRPC surface.
	// -------------------------------------------------------------------------

	async function submitTurn(text: string) {
		const requestId = nextRequestId();
		const receipt = await host.trpc.sessions.submitTurn.mutate({
			requestId,
			sessionId: sessionA.id,
			threadId: mainThreadA.id,
			content: [{ type: "text", text }],
		});
		expect(receipt.status).toBe("accepted");
		return receipt;
	}

	async function allowPermission(permissionId: string, kind: string) {
		const pending = pendingPermissions().find(
			(entry) => entry.id === permissionId,
		);
		if (!pending) throw new Error(`permission ${permissionId} not pending`);
		const option =
			pending.options.find((entry) => entry.kind === kind) ??
			pending.options[0];
		if (!option) throw new Error("permission card offered no options");
		const receipt = await host.trpc.sessions.resolvePermission.mutate({
			requestId: nextRequestId(),
			sessionId: sessionA.id,
			permissionId,
			outcome: { type: "selected", optionIds: [option.id] },
		});
		expect(receipt.status).toBe("accepted");
	}

	/**
	 * Answer a card, then wait for its permissionResolved to fold back into
	 * the store. The tRPC ack races the WebSocket event by design (admission
	 * vs completion), so a caller that immediately asserts "no cards pending"
	 * would otherwise trip over the card it just answered.
	 */
	async function allowPermissionAndDrain(permissionId: string, kind: string) {
		await allowPermission(permissionId, kind);
		await waitFor(
			() => !pendingPermissions().some((entry) => entry.id === permissionId),
			30_000,
			`the answered card ${permissionId} to drain from the store`,
		);
	}

	/** Await the turn's end; fail fast if any permission card appears. */
	async function expectNoCardTurn(
		turnId: string,
		timeoutMs = 240_000,
	): Promise<string> {
		const deadline = Date.now() + timeoutMs;
		while (true) {
			const end = turnEnd(turnId);
			if (end) {
				if (end.kind !== "completed") {
					throw new Error(`expected completion, turn was ${end.kind}`);
				}
				return end.stopReason;
			}
			const pending = pendingPermissions();
			if (pending.length > 0) {
				throw new Error(
					`unexpected permission card during a no-card turn: ${toolCallTitles(pending[0]?.toolCallId ?? "").join(" / ")}`,
				);
			}
			if (Date.now() > deadline) {
				throw new Error(`no-card turn did not finish within ${timeoutMs}ms`);
			}
			await sleep(250);
		}
	}

	/** Await the turn's end, answering every card with allow-once. */
	async function settleTurnAllowingCards(
		turnId: string,
		timeoutMs = 300_000,
	): Promise<string> {
		const answered = new Set<string>();
		const deadline = Date.now() + timeoutMs;
		while (true) {
			const end = turnEnd(turnId);
			if (end) {
				if (end.kind !== "completed") {
					throw new Error(`expected completion, turn was ${end.kind}`);
				}
				return end.stopReason;
			}
			for (const pending of pendingPermissions()) {
				if (answered.has(pending.id)) continue;
				answered.add(pending.id);
				await allowPermission(pending.id, "allowOnce");
			}
			if (Date.now() > deadline) {
				throw new Error(`turn did not settle within ${timeoutMs}ms`);
			}
			await sleep(250);
		}
	}

	beforeAll(async () => {
		gymDir = provisionGym("sessions-story-");
		manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => gymDir,
		});
		host = await createTestHost({ acpSessions: manager });
		server = await new Promise<ServerType>((resolve) => {
			const instance = serve({ fetch: host.app.fetch, port: 0 }, () =>
				resolve(instance),
			);
		});
		host.injectWebSocket(server);
		const { port: httpPort } = server.address() as AddressInfo;
		client = createSessionsSyncClient({
			clientInstanceId: "story-client-1",
			clientVersion: "0.0.0-test",
			syncUrl: `ws://127.0.0.1:${httpPort}${SESSIONS_SYNC_PATH}?token=${host.psk}`,
			api: {
				list: () => host.trpc.sessions.list.query(),
				get: (input) => host.trpc.sessions.get.query(input),
				getEvents: (input) => host.trpc.sessions.getEvents.query(input),
				resolveToolCall: async (input) => {
					await host.trpc.sessions.resolveToolCall.mutate(input);
				},
			},
			logger: { log: (event) => logs.push(event) },
		});
		client.connect();
		await waitFor(
			() => client.store.getState().hostSubscription.status === "live",
			15_000,
			"the host stream to go live",
		);

		// Story step 2: create the session with the model pinned and the mode
		// left at the harness default (never bypass).
		const created = await host.trpc.sessions.create.mutate({
			requestId: nextRequestId(),
			workspaceId: "sessions-story-workspace",
			agentId: "claude-code",
			title: "Gym story",
			settings: {
				activeModel: STORY_MODEL,
				activeMode: null,
				effort: STORY_EFFORT,
				configuration: {},
			},
		});
		sessionA = created.session;
		mainThreadA = created.mainThread;
		// Settings application is best-effort on create; the story depends on
		// the pin actually taking, so fail loudly here rather than mid-story.
		// The adapter may canonicalize to an account variant (opus → opus[1m]),
		// and the entity reports the adapter's truth, not the requested value.
		expect(created.session.settings.activeModel ?? "").toContain(STORY_MODEL);
		expect(created.session.settings.activeMode).toBe("default");

		client.retainSession(sessionA.id, "focused");
		await waitFor(
			() =>
				client.store.getState().streamsBySessionId[sessionA.id]?.status ===
				"live",
			15_000,
			"the story session stream to go live",
		);
	}, 120_000);

	afterAll(async () => {
		client?.disconnect();
		// host.dispose() also disposes the injected AcpSessionManager (app.ts
		// owns adapter teardown).
		await host?.dispose();
		// Not awaited: Bun's node:http shim never fires the close callback.
		server?.close();
		if (gymDir) {
			try {
				rmSync(gymDir, { recursive: true, force: true });
			} catch {
				// best-effort
			}
		}
	});

	test("steps 2-5: first message streams, Stop interrupts mid-tour, continue reaches TOUR_DONE", async () => {
		const receipt = await submitTurn(FIRST_MESSAGE);

		// Step 3: the tour streams into the client store live.
		await waitFor(
			() => agentText().length > 300,
			120_000,
			"the tour to start streaming",
		);
		expect(agentText()).not.toContain("TOUR_DONE");

		// The admission chain is intact: the turn this receipt opened carries
		// the mutation's requestId as its causation.
		const started = events().find(
			(event) =>
				event.payload.type === "turnStarted" &&
				event.payload.turn.id === receipt.turnId,
		);
		if (!started) throw new Error("turnStarted never reached the client");
		expect(started.causationId).toBe(receipt.requestId);

		// Step 4: Stop while text is still arriving.
		const cancel = await host.trpc.sessions.cancelTurn.mutate({
			requestId: nextRequestId(),
			sessionId: sessionA.id,
			turnId: receipt.turnId,
		});
		expect(cancel.status).toBe("accepted");
		await waitFor(
			() => turnEnd(receipt.turnId) !== null,
			60_000,
			"the interrupted turn to settle",
		);
		expect(turnEnd(receipt.turnId)).toEqual({ kind: "cancelled" });
		await waitFor(
			() => sessionEntity().runState === "idle",
			30_000,
			"the session to return to idle",
		);
		expect(pendingPermissions()).toEqual([]);
		const partial = agentText();
		expect(partial.length).toBeGreaterThan(0);
		expect(partial).not.toContain("TOUR_DONE");

		// Step 5: a bare "continue" resumes the same conversation.
		const resume = await submitTurn("continue");
		expect(await expectNoCardTurn(resume.turnId)).toBe("endTurn");
		expect(agentText()).toContain("TOUR_DONE");
	}, 300_000);

	test("steps 6-7: Bash raises a card, allow-once runs it, double answer is rejected as stale", async () => {
		const before = agentText().length;
		const { turnId } = await submitTurn(
			"Run exactly `sh scripts/ok.sh` with the Bash tool exactly once, then reply with exactly RUN_OK followed by the script's output. Do not use any other tool.",
		);
		await waitFor(
			() => pendingPermissions().length > 0,
			120_000,
			"the Bash permission card",
		);
		// "Needs attention", not "stuck": the card sits in pendingPermissions
		// while the turn stays formally running — attention badges are a
		// client-side derivation over this, not protocol state.
		expect(sessionEntity().runState).toBe("running");
		const card = pendingPermissions()[0];
		if (!card) throw new Error("Bash permission disappeared");

		const kinds = card.options.map((option) => option.kind);
		expect(kinds).toContain("allowOnce");
		expect(kinds).toContain("allowAlways");
		expect(kinds).toContain("rejectOnce");

		await allowPermissionAndDrain(card.id, "allowOnce");
		// Step 7: tapping Allow twice — the second answer targets a permission
		// that no longer exists and is rejected without side effects.
		await expect(
			host.trpc.sessions.resolvePermission.mutate({
				requestId: nextRequestId(),
				sessionId: sessionA.id,
				permissionId: card.id,
				outcome: {
					type: "selected",
					optionIds: [card.options[0]?.id ?? "allow"],
				},
			}),
		).rejects.toThrow(/No pending permission/);

		expect(await expectNoCardTurn(turnId)).toBe("endTurn");
		const reply = agentText().slice(before);
		expect(reply).toContain("RUN_OK");
		expect(reply).toContain(GYM_SCRIPT_SENTINEL);
	}, 300_000);

	test("steps 8-9: always-allow persists — the same command reruns with zero new cards", async () => {
		// Step 8: run again, answer with always-allow this time.
		const { turnId } = await submitTurn(
			"Run exactly `sh scripts/ok.sh` with the Bash tool exactly once more, then reply with exactly RUN_OK followed by the script's output. Do not use any other tool.",
		);
		await waitFor(
			() => pendingPermissions().length > 0,
			120_000,
			"the second Bash permission card",
		);
		const card = pendingPermissions()[0];
		if (!card) throw new Error("second Bash permission disappeared");
		await allowPermissionAndDrain(card.id, "allowAlways");
		expect(await expectNoCardTurn(turnId)).toBe("endTurn");

		// Step 9: the rule holds — two more runs, no card ever appears.
		const since = marker();
		const before = agentText().length;
		const rerun = await submitTurn(
			"Run exactly `sh scripts/ok.sh` with the Bash tool exactly twice, one call after the other, then reply with exactly RUN_TWICE_OK. Do not use any other tool.",
		);
		expect(await expectNoCardTurn(rerun.turnId)).toBe("endTurn");
		expect(permissionRequestsSince(since)).toBe(0);
		expect(agentText().slice(before)).toContain("RUN_TWICE_OK");
	}, 300_000);

	test("steps 10-11: an edit raises a fresh card; Stop + acceptEdits + continue finishes without one", async () => {
		// Step 10: always-allow was per-tool — a file edit still cards.
		const since = marker();
		const { turnId } = await submitTurn(
			'Change the title of README.md to "Gym" using a file editing tool, then reply with exactly EDIT_DONE. Do not use the Bash tool.',
		);
		await waitFor(
			() => pendingPermissions().length > 0,
			120_000,
			"the edit permission card",
		);
		const editTools = toolNamesSince(since);
		expect(editTools.some((name) => ["Edit", "Write"].includes(name))).toBe(
			true,
		);
		expect(editTools).not.toContain("Bash");

		// Step 11: Stop instead of answering, switch the session to an
		// auto-accepting mode over tRPC, then continue.
		await host.trpc.sessions.cancelTurn.mutate({
			requestId: nextRequestId(),
			sessionId: sessionA.id,
			turnId,
		});
		await waitFor(
			() => turnEnd(turnId) !== null,
			60_000,
			"the cancelled edit turn to settle",
		);
		await waitFor(
			() => pendingPermissions().length === 0,
			30_000,
			"the abandoned card to drain",
		);

		const settings = await host.trpc.sessions.update.mutate({
			requestId: nextRequestId(),
			sessionId: sessionA.id,
			settings: { activeMode: "acceptEdits" },
		});
		expect(settings.status).toBe("accepted");
		await waitFor(
			() => sessionEntity().settings.activeMode === "acceptEdits",
			30_000,
			"the mode change to reach the client store",
		);

		const resumeSince = marker();
		const before = agentText().length;
		// A bare "continue" is ambiguous after a rejected edit — be explicit
		// that the mode change means the edit should be applied now.
		const resume = await submitTurn(
			'Continue: I switched this session to acceptEdits mode, so apply that README.md title change to "Gym" now, then reply with exactly EDIT_DONE. Do not use the Bash tool.',
		);
		expect(await expectNoCardTurn(resume.turnId)).toBe("endTurn");
		expect(permissionRequestsSince(resumeSince)).toBe(0);
		expect(agentText().slice(before)).toContain("EDIT_DONE");

		// The end state is on disk, not just in the transcript.
		const readme = readFileSync(path.join(gymDir, "README.md"), "utf8");
		expect(readme).toMatch(/^# Gym\s*$/m);
		expect(readme).not.toContain("Gym fixture");
	}, 300_000);

	test("steps 12-13: two questions arrive as sequential cards; answer one, skip the other", async () => {
		const since = marker();
		const before = agentText().length;
		const { turnId } = await submitTurn(
			'Use the AskUserQuestion tool exactly once with two questions. Question one: "Pick a color" with exactly two options, red and blue. Question two: "Pick a number" with exactly two options, 1 and 2. Do not answer them yourself. After receiving the answers, reply with exactly ANSWERS followed by the answers you received.',
		);

		// The first question surfaces alone; the second only after it resolves.
		await waitFor(
			() => pendingPermissions().length > 0,
			120_000,
			"the first question card",
		);
		const colorCard = pendingPermissions()[0];
		if (!colorCard) throw new Error("color question disappeared");
		expect(toolCallTitles(colorCard.toolCallId).join(" ")).toContain(
			"Pick a color",
		);
		const optionNames = colorCard.options.map((option) => option.name);
		expect(optionNames).toContain("red");
		expect(optionNames).toContain("blue");
		expect(optionNames).toContain("Skip");
		const blue = colorCard.options.find((option) => option.name === "blue");
		if (!blue) throw new Error("blue option missing");
		await host.trpc.sessions.resolvePermission.mutate({
			requestId: nextRequestId(),
			sessionId: sessionA.id,
			permissionId: colorCard.id,
			outcome: { type: "selected", optionIds: [blue.id] },
		});
		await waitFor(
			() => !pendingPermissions().some((entry) => entry.id === colorCard.id),
			30_000,
			"the answered color card to drain",
		);

		await waitFor(
			() => {
				const pending = pendingPermissions();
				return pending.length > 0 && pending[0]?.id !== colorCard.id;
			},
			120_000,
			"the second question card",
		);
		const numberCard = pendingPermissions()[0];
		if (!numberCard) throw new Error("number question disappeared");
		expect(toolCallTitles(numberCard.toolCallId).join(" ")).toContain(
			"Pick a number",
		);
		const skip =
			numberCard.options.find((option) => option.name === "Skip") ??
			numberCard.options.find((option) => option.id === "skip");
		if (!skip) throw new Error("Skip option missing");
		await host.trpc.sessions.resolvePermission.mutate({
			requestId: nextRequestId(),
			sessionId: sessionA.id,
			permissionId: numberCard.id,
			outcome: { type: "selected", optionIds: [skip.id] },
		});
		await waitFor(
			() => !pendingPermissions().some((entry) => entry.id === numberCard.id),
			30_000,
			"the skipped number card to drain",
		);

		expect(await expectNoCardTurn(turnId)).toBe("endTurn");
		const reply = agentText().slice(before);
		expect(reply).toContain("ANSWERS");
		expect(reply).toContain("blue");
		// Exactly one canonical card per question — no dupes, no extras.
		expect(permissionRequestsSince(since)).toBe(2);
	}, 300_000);

	test("step 14: a Task subagent surfaces as its own thread and reports through the main one", async () => {
		const since = marker();
		const before = agentText().length;
		const { turnId } = await submitTurn(
			"Launch exactly one subagent that reads notes.txt and reports the expected_sum value. Then reply with exactly SUB_OK followed by that value.",
		);
		expect(await settleTurnAllowingCards(turnId)).toBe("endTurn");

		// The subagent tool is named Task or Agent depending on SDK version.
		const subagentCalls = toolNamesSince(since).filter((name) =>
			["Task", "Agent"].includes(name),
		);
		expect(subagentCalls.length).toBeGreaterThan(0);
		// The canonical surface's target contract: child activity lands in a
		// partial-fidelity subagent thread, never flattened away.
		const subThreads = events()
			.slice(since)
			.flatMap((event) =>
				event.payload.type === "threadCreated" &&
				event.payload.thread.kind === "subagent"
					? [event.payload.thread]
					: [],
			);
		expect(subThreads.length).toBeGreaterThan(0);
		expect(subThreads[0]?.fidelity).toBe("partial");
		expect(subThreads[0]?.parentThreadId).toBe(mainThreadA.id);
		expect(agentText().slice(before)).toContain("SUB_OK 42");
	}, 300_000);

	test("step 15: the saved gym workflow launches, runs its five agents, and verifies", async () => {
		const since = marker();
		const before = agentText().length;
		const { turnId } = await submitTurn(
			`Launch the named workflow ${GYM_WORKFLOW_NAME} exactly once with the Workflow tool. Do not perform its work yourself and do not use another tool. The Workflow tool runs asynchronously; after it confirms the background launch, reply with exactly WORKFLOW_LAUNCHED and do not cancel it.`,
		);
		expect(await settleTurnAllowingCards(turnId)).toBe("endTurn");
		expect(agentText().slice(before)).toContain("WORKFLOW_LAUNCHED");
		expect(toolNamesSince(since)).toContain("Workflow");

		// The ACP bridge exposes the structured launch payload (runId,
		// transcriptDir) only via private _meta, which the canonical surface
		// deliberately does not forward — a typed workflow run model is an
		// explicit rollout backlog item. Until then, find this run's state
		// file on disk under the gym's Claude project directory.
		type WorkflowRunState = {
			workflowName?: string;
			status?: string;
			agentCount?: number;
			result?: { verified?: { valid?: boolean; marker?: string } };
		};
		const projectsDir = path.join(os.homedir(), ".claude", "projects");
		const gymKey = path.basename(gymDir);
		const readRunStates = (workflowsDir: string): WorkflowRunState[] => {
			if (!existsSync(workflowsDir)) return [];
			return readdirSync(workflowsDir)
				.filter((file) => file.endsWith(".json"))
				.flatMap((file): WorkflowRunState[] => {
					try {
						return [
							JSON.parse(
								readFileSync(path.join(workflowsDir, file), "utf8"),
							) as WorkflowRunState,
						];
					} catch {
						return [];
					}
				});
		};
		// Run state lands at <project>/<native-session-id>/workflows/<runId>.json;
		// scan one directory level under the gym's project dir (and the project
		// dir itself, in case the layout flattens in a future harness version).
		const findRunStates = (): WorkflowRunState[] => {
			if (!existsSync(projectsDir)) return [];
			return readdirSync(projectsDir)
				.filter((name) => name.includes(gymKey))
				.flatMap((name) => {
					const projectDir = path.join(projectsDir, name);
					const nested = readdirSync(projectDir, { withFileTypes: true })
						.filter((entry) => entry.isDirectory())
						.map((entry) => path.join(projectDir, entry.name, "workflows"));
					return [path.join(projectDir, "workflows"), ...nested].flatMap(
						readRunStates,
					);
				});
		};
		let finished: WorkflowRunState | null = null;
		await waitFor(
			() => {
				const runs = findRunStates().filter(
					(run) => run.workflowName === GYM_WORKFLOW_NAME,
				);
				const dead = runs.find((run) =>
					["failed", "killed", "cancelled"].includes(run.status ?? ""),
				);
				if (dead) {
					throw new Error(
						`Workflow run did not complete: ${JSON.stringify(dead)}`,
					);
				}
				finished = runs.find((run) => run.status === "completed") ?? null;
				return finished !== null;
			},
			240_000,
			"the gym workflow agents to complete",
		);
		if (!finished) throw new Error("Workflow completed without run state");
		const runState = finished as WorkflowRunState;
		expect(runState.agentCount).toBe(5);
		expect(runState.result?.verified?.valid).toBe(true);
		expect(runState.result?.verified?.marker).toBe("WORKFLOW_VERIFIED");
	}, 600_000);

	test("step 16: the project gym-check skill runs and reports its sentinel", async () => {
		const since = marker();
		const before = agentText().length;
		const { turnId } = await submitTurn(
			"Use the Skill tool to run the gym-check skill from this repository, then follow the skill's instructions exactly.",
		);
		expect(await settleTurnAllowingCards(turnId)).toBe("endTurn");
		expect(toolNamesSince(since)).toContain("Skill");
		expect(agentText().slice(before)).toContain(GYM_SKILL_SENTINEL);
	}, 300_000);

	test("step 17: a second session streams in parallel on the same socket with no bleed", async () => {
		// Keep the main session busy with a long no-tools turn...
		const essayBefore = agentText().length;
		const essay = await submitTurn(
			"Write a continuous ~500-word essay about training gyms in plain prose, using no tools, and end with the line ESSAY_DONE.",
		);
		await waitFor(
			() => agentText().length > essayBefore + 100,
			120_000,
			"the essay to start streaming",
		);

		// ...then run a whole second session start-to-finish while it streams,
		// over the SAME client store and physical socket.
		const createdB = await host.trpc.sessions.create.mutate({
			requestId: nextRequestId(),
			workspaceId: "sessions-story-workspace",
			agentId: "claude-code",
			title: "Gym story parallel",
			settings: {
				activeModel: STORY_MODEL,
				activeMode: null,
				effort: STORY_EFFORT,
				configuration: {},
			},
		});
		expect(createdB.session.settings.activeModel ?? "").toContain(STORY_MODEL);
		client.retainSession(createdB.session.id, "focused");
		await waitFor(
			() =>
				client.store.getState().streamsBySessionId[createdB.session.id]
					?.status === "live",
			30_000,
			"session B to go live on the shared socket",
		);

		let overlapped = false;
		let secondDone = false;
		const overlapWatch = (async () => {
			while (!secondDone) {
				if (sessionEntity().runState === "running") overlapped = true;
				await sleep(200);
			}
		})();

		const receiptB = await host.trpc.sessions.submitTurn.mutate({
			requestId: nextRequestId(),
			sessionId: createdB.session.id,
			threadId: createdB.mainThread.id,
			content: [
				{
					type: "text",
					text: "Reply with exactly PARALLEL_OK and nothing else.",
				},
			],
		});
		await waitFor(
			() =>
				(
					client.store.getState().streamsBySessionId[createdB.session.id]
						?.eventIds ?? []
				).some((id) => {
					const stream =
						client.store.getState().streamsBySessionId[createdB.session.id];
					const event = stream?.eventsById[id];
					return (
						event?.payload.type === "turnCompleted" &&
						event.payload.turnId === receiptB.turnId
					);
				}),
			240_000,
			"session B's turn to complete",
		);
		secondDone = true;
		await overlapWatch;
		expect(overlapped).toBe(true);

		// Session B's stream carries only its own story.
		const streamB =
			client.store.getState().streamsBySessionId[createdB.session.id];
		if (!streamB) throw new Error("session B stream missing");
		const textB = streamB.eventIds
			.map((id) => streamB.eventsById[id])
			.flatMap((event) =>
				event?.payload.type === "messageDelta" &&
				event.payload.content.type === "text"
					? [event.payload.content.text]
					: [],
			)
			.join("");
		expect(textB).toContain("PARALLEL_OK");
		expect(textB).not.toContain("ESSAY_DONE");

		expect(await expectNoCardTurn(essay.turnId)).toBe("endTurn");
		expect(agentText()).toContain("ESSAY_DONE");
		expect(agentText()).not.toContain("PARALLEL_OK");
	}, 300_000);

	test("the wire stayed clean and the store matches the host's own answers", async () => {
		// The client hard-validates every frame and force-closes on mismatch,
		// so zero drops/resets makes the whole story a wire-conformance run.
		const drops = logs.filter(
			(event) =>
				event.event === "sessions_sync.socket_dropped" ||
				event.event === "sessions_sync.stream_reset",
		);
		expect(drops).toEqual([]);
		expect(client.store.getState().connection.error).toBeNull();

		// Parity oracle: page the whole log backwards over tRPC and compare it
		// to the client store's fold, event for event. The client retained the
		// session at birth (the seed tail held the entire young log), so its
		// fold must equal the host's full journal, and the entities must agree.
		const full: SessionEvent[] = [];
		let beforeCursor: string | undefined;
		while (true) {
			const window = await host.trpc.sessions.getEvents.query({
				sessionId: sessionA.id,
				...(beforeCursor === undefined ? {} : { beforeCursor }),
				limit: 100,
			});
			full.unshift(...window.items);
			if (!window.range.hasMoreBefore) break;
			const oldest = window.range.oldest;
			if (!oldest) throw new Error("hasMoreBefore with no oldest boundary");
			beforeCursor = oldest.cursor;
		}
		expect(full.length).toBeGreaterThan(0);
		expect(events()).toEqual(full);

		const snapshot = await host.trpc.sessions.get.query({
			sessionId: sessionA.id,
		});
		expect(sessionEntity()).toEqual(snapshot.session);
		expect(snapshot.session.runState).toBe("idle");
		expect(snapshot.pendingPermissions).toEqual([]);
		expect(pendingPermissions()).toEqual([]);
		// The story is quiescent, so the snapshot head is the fold's head.
		const streamA = client.store.getState().streamsBySessionId[sessionA.id];
		expect(streamA?.latestCursor).toBe(snapshot.head);
	});
});
