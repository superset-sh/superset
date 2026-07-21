/**
 * Belt-and-suspenders ACP regression coverage against the deterministic fake
 * adapter
 * (test/fixtures/fake-acp-adapter.ts): real AcpSessionManager, real child
 * processes over JSON-RPC/stdio, real Hono/node-ws stream route, real
 * `subscribeToSession` WS client — but the model and Claude adapter are fake.
 * This runs in every `bun test` with no tokens or network, but does not prove
 * compatibility with real Claude behavior. The ACP_E2E-gated authenticated
 * real-adapter suites are the primary acceptance lane and must be run on a Mac
 * after relevant ACP/runtime changes.
 *
 * This deterministic backup covers broad and long-haul paths cheaply: a
 * ~30-turn marathon with gapless streams and pagination folds,
 * permission allow/deny (including concurrent requests), single- and
 * multi-select elicitations, cancel mid-tool-call/question, adapter crash,
 * replacement of a memory-only manager,
 * stale-cursor eviction resyncs, non-fatal prompt rejection, create
 * idempotency, mode/config round-trips, elicitation edge modes, credential
 * scrubbing, concurrent turns, graveyard eviction, and list pagination.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
	decodeMessagesCursor,
	emptyTimeline,
	foldEnvelopes,
	makeSelectedOutcome,
	type SessionScopedState,
	type SessionUpdateEnvelope,
	type Timeline,
} from "@superset/session-protocol";
import {
	type SessionSubscription,
	subscribeToSession,
} from "@superset/session-protocol/client";
import { Hono } from "hono";
import {
	AcpSessionManager,
	AcpSessionNotFoundError,
	AcpWorkspaceMismatchError,
	registerAcpSessionStreamRoute,
} from "../../src/runtime/acp-sessions";

const FAKE_ADAPTER = path.join(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);
const WORKSPACE_ID = "acp-e2e-workspace";

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
		await sleep(10);
	}
}

function agentText(timeline: Timeline): string {
	return timeline.items
		.filter((item) => item.kind === "message" && item.role === "agent")
		.flatMap((item) => (item.kind === "message" ? item.blocks : []))
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("\n");
}

function configValue(
	state: SessionScopedState,
	configId: string,
): string | boolean | undefined {
	return state.configOptions.find((option) => option.id === configId)
		?.currentValue;
}

function expectGapless(envelopes: SessionUpdateEnvelope[]): void {
	expect(envelopes.length).toBeGreaterThan(0);
	expect(envelopes[0]?.seq).toBe(1);
	for (let i = 1; i < envelopes.length; i += 1) {
		expect(envelopes[i]?.seq).toBe((envelopes[i - 1]?.seq ?? 0) + 1);
	}
}

describe("acp-sessions e2e (fake adapter)", () => {
	const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-e2e-"));
	const managers: AcpSessionManager[] = [];
	const servers: ServerType[] = [];
	const subscriptions: SessionSubscription[] = [];

	function newManager(options?: { journalCapacity?: number }) {
		const manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
			adapterEntry: FAKE_ADAPTER,
			...options,
		});
		managers.push(manager);
		return manager;
	}

	async function startServer(manager: AcpSessionManager): Promise<string> {
		const app = new Hono();
		const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
		registerAcpSessionStreamRoute({
			app,
			sessions: manager,
			upgradeWebSocket,
		});
		const started = await new Promise<ServerType>((resolve) => {
			const instance = serve({ fetch: app.fetch, port: 0 }, () =>
				resolve(instance),
			);
		});
		injectWebSocket(started);
		servers.push(started);
		const { port } = started.address() as AddressInfo;
		return `ws://127.0.0.1:${port}`;
	}

	function connect(options: {
		baseUrl: string;
		sessionId: string;
		since?: number;
		onReset?: (reason: string) => void;
	}): { received: SessionUpdateEnvelope[]; resets: string[] } {
		const received: SessionUpdateEnvelope[] = [];
		const resets: string[] = [];
		const subscription = subscribeToSession({
			streamUrl: `${options.baseUrl}/acp-sessions/${options.sessionId}/stream`,
			since: options.since,
			onEnvelope: (envelope) => received.push(envelope),
			onReset: (reason) => {
				resets.push(reason);
				options.onReset?.(reason);
			},
		});
		subscriptions.push(subscription);
		return { received, resets };
	}

	afterAll(async () => {
		for (const subscription of subscriptions.splice(0)) {
			subscription.close();
		}
		for (const server of servers.splice(0)) {
			(
				server as unknown as { closeAllConnections?: () => void }
			).closeAllConnections?.();
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		}
		await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
	});

	test("30-turn marathon: gapless WS stream, folded timeline, pagination agrees", async () => {
		const manager = newManager();
		const baseUrl = await startServer(manager);
		const sessionId = "e2e-marathon";

		const created = await manager.create({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		expect(created.status).toBe("idle");
		// D14-c: the fake starts sessions in bypassPermissions, like the real
		// adapter — the manager must have switched it to default.
		expect(created.currentMode?.currentModeId).toBe("default");

		const stream = connect({ baseUrl, sessionId, since: 0 });

		const TURNS = 30;
		for (let i = 1; i <= TURNS; i += 1) {
			const text =
				i % 5 === 0
					? `tool step-${i}`
					: i % 7 === 0
						? `title marathon-${i}`
						: `say turn-${i}`;
			const { accepted, turn } = manager.prompt({
				sessionId,
				prompt: [{ type: "text", text }],
			});
			expect(accepted).toBe(true);
			const { stopReason } = await turn;
			expect(stopReason).toBe("end_turn");
		}

		const state = manager.get(sessionId);
		expect(state.status).toBe("idle");
		expect(state.lastStopReason).toBe("end_turn");
		expect(state.lastError).toBeNull();
		// The last `title` turn's session_info_update landed in state.
		expect(state.title).toBe("marathon-28");

		// The WS subscriber saw every journaled envelope, gapless from seq 1.
		await waitFor(
			() => stream.received.at(-1)?.seq === state.lastSeq,
			10_000,
			"the WS stream to catch up to lastSeq",
		);
		expectGapless(stream.received);
		expect(stream.resets).toEqual([]);

		// Every turn's output is present, in order, in the folded timeline.
		const timeline = foldEnvelopes(emptyTimeline(), stream.received);
		const text = agentText(timeline);
		let lastIndex = -1;
		for (let i = 1; i <= TURNS; i += 1) {
			const marker =
				i % 5 === 0
					? `tool step-${i} done`
					: i % 7 === 0
						? `titled marathon-${i}`
						: `turn-${i}`;
			const index = text.indexOf(marker);
			expect(index).toBeGreaterThan(lastIndex);
			lastIndex = index;
		}
		// Six tool turns (5, 10, 15, 20, 25, 30), all completed.
		const toolItems = timeline.items.filter(
			(item) => item.kind === "tool_call",
		);
		expect(toolItems).toHaveLength(6);
		for (const item of toolItems) {
			if (item.kind !== "tool_call") continue;
			expect(item.call.status).toBe("completed");
		}
		// One user message per turn made it into the timeline.
		expect(
			timeline.items.filter(
				(item) => item.kind === "message" && item.role === "user",
			),
		).toHaveLength(TURNS);

		// Paging backwards through getMessages and re-folding reproduces the
		// exact same timeline the live stream produced.
		const pages: SessionUpdateEnvelope[][] = [];
		let beforeSeq: number | undefined;
		for (;;) {
			const page = manager.getMessages({ sessionId, beforeSeq, limit: 17 });
			pages.push(page.items);
			if (page.nextCursor === null) break;
			const decoded = decodeMessagesCursor(page.nextCursor);
			if (decoded === null) throw new Error("undecodable cursor from host");
			beforeSeq = decoded;
		}
		const paged = pages.reverse().flat();
		const pagedTimeline = foldEnvelopes(emptyTimeline(), paged);
		expect(agentText(pagedTimeline)).toBe(text);
		expect(pagedTimeline.items).toHaveLength(timeline.items.length);
	}, 60_000);

	test("permission flow: allow completes the tool, deny fails it, dup answers are stale", async () => {
		const manager = newManager();
		const sessionId = "e2e-permission";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		// Allow path.
		const allowed = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "permission risky-write" }],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"a pending permission (allow path)",
		);
		let state = manager.get(sessionId);
		expect(state.status).toBe("awaiting_permission");
		const allowPending = state.pendingPermissions[0];
		if (!allowPending) throw new Error("pending permission disappeared");
		// The real adapter's option triple, exactly as real runs emit it.
		expect(allowPending.options.map((option) => option.optionId)).toEqual([
			"allow_always",
			"allow",
			"reject",
		]);
		const first = manager.respondToPermission({
			sessionId,
			requestId: allowPending.requestId,
			outcome: { outcome: "selected", optionId: "allow" },
		});
		const second = manager.respondToPermission({
			sessionId,
			requestId: allowPending.requestId,
			outcome: { outcome: "selected", optionId: "allow" },
		});
		expect(first.status).toBe("resolved");
		expect(second.status).toBe("already_resolved");
		expect((await allowed.turn).stopReason).toBe("end_turn");

		// Deny path.
		const denied = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "permission risky-delete" }],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"a pending permission (deny path)",
		);
		const denyPending = manager.get(sessionId).pendingPermissions[0];
		if (!denyPending) throw new Error("pending permission disappeared");
		manager.respondToPermission({
			sessionId,
			requestId: denyPending.requestId,
			outcome: { outcome: "selected", optionId: "reject" },
		});
		expect((await denied.turn).stopReason).toBe("end_turn");

		state = manager.get(sessionId);
		expect(state.pendingPermissions).toEqual([]);
		expect(state.status).toBe("idle");

		const page = manager.getMessages({ sessionId, limit: 200 });
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const text = agentText(timeline);
		expect(text).toContain("allowed risky-write");
		expect(text).toContain("denied risky-delete");
		const statuses = timeline.items
			.filter((item) => item.kind === "tool_call")
			.map((item) => (item.kind === "tool_call" ? item.call.status : ""));
		expect(statuses).toEqual(["completed", "failed"]);
	}, 30_000);

	test("two simultaneous permissions stay independently correlated and awaiting until both resolve", async () => {
		const manager = newManager();
		const sessionId = "e2e-concurrent-permissions";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "permissions write-report,delete-cache" }],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length === 2,
			10_000,
			"both permission cards",
		);
		const [first, second] = manager.get(sessionId).pendingPermissions;
		if (!first || !second)
			throw new Error("concurrent permissions disappeared");
		expect(first.requestId).not.toBe(second.requestId);
		expect(first.toolCall.toolCallId).not.toBe(second.toolCall.toolCallId);
		expect(manager.get(sessionId).status).toBe("awaiting_permission");

		// Resolve in reverse tool order to prove request ids, not array positions,
		// correlate the answers. One unresolved card must keep the session blocked.
		expect(
			manager.respondToPermission({
				sessionId,
				requestId: second.requestId,
				outcome: { outcome: "selected", optionId: "reject" },
			}),
		).toEqual({ status: "resolved" });
		expect(manager.get(sessionId).pendingPermissions).toHaveLength(1);
		expect(manager.get(sessionId).pendingPermissions[0]?.requestId).toBe(
			first.requestId,
		);
		expect(manager.get(sessionId).status).toBe("awaiting_permission");

		expect(
			manager.respondToPermission({
				sessionId,
				requestId: first.requestId,
				outcome: { outcome: "selected", optionId: "allow" },
			}),
		).toEqual({ status: "resolved" });
		expect((await turn).stopReason).toBe("end_turn");
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);
		expect(manager.get(sessionId).status).toBe("idle");

		const page = manager.getMessages({ sessionId, limit: 200 });
		expect(
			page.items.filter(
				(envelope) => envelope.frame.kind === "permission_requested",
			),
		).toHaveLength(2);
		expect(
			page.items.filter(
				(envelope) => envelope.frame.kind === "permission_resolved",
			),
		).toHaveLength(2);
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		expect(agentText(timeline)).toContain("allowed write-report");
		expect(agentText(timeline)).toContain("denied delete-cache");
		const tools = timeline.items.filter((item) => item.kind === "tool_call");
		expect(tools.map((item) => item.call.status)).toEqual([
			"completed",
			"failed",
		]);
	}, 30_000);

	test("elicitations: single-select answers by option, multi-select rides _meta", async () => {
		const manager = newManager();
		const sessionId = "e2e-elicitation";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		// Single-select: pick the middle label.
		const single = manager.prompt({
			sessionId,
			prompt: [
				{ type: "text", text: "ask-single pick a color|red, green, blue" },
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"the single-select question card",
		);
		const singleCard = manager.get(sessionId).pendingPermissions[0];
		if (!singleCard) throw new Error("question card disappeared");
		expect(singleCard.multiSelect).toBeUndefined();
		expect(singleCard.toolCall.title).toBe("pick a color");
		expect(singleCard.options.map((option) => option.name)).toEqual([
			"red",
			"green",
			"blue",
			"Skip",
		]);
		manager.respondToPermission({
			sessionId,
			requestId: singleCard.requestId,
			outcome: { outcome: "selected", optionId: "option-1" },
		});
		expect((await single.turn).stopReason).toBe("end_turn");

		// Multi-select: pick the first and last labels in one outcome.
		const multi = manager.prompt({
			sessionId,
			prompt: [
				{ type: "text", text: "ask-multi pick fruits|apple, banana, cherry" },
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"the multi-select question card",
		);
		const multiCard = manager.get(sessionId).pendingPermissions[0];
		if (!multiCard) throw new Error("question card disappeared");
		expect(multiCard.multiSelect).toBe(true);
		manager.respondToPermission({
			sessionId,
			requestId: multiCard.requestId,
			outcome: makeSelectedOutcome(["option-0", "option-2"]),
		});
		expect((await multi.turn).stopReason).toBe("end_turn");

		const page = manager.getMessages({ sessionId, limit: 200 });
		const text = agentText(foldEnvelopes(emptyTimeline(), page.items));
		expect(text).toContain("picked:green");
		expect(text).toContain("picked:apple+cherry");
	}, 30_000);

	test("cancel mid-tool-call: turn stops as cancelled, the open tool call terminalizes", async () => {
		const manager = newManager();
		const sessionId = "e2e-cancel";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "hang" }],
		});
		await waitFor(
			() => manager.get(sessionId).status === "running",
			10_000,
			"the hanging turn to start",
		);
		// Give the in_progress tool_call time to journal before cancelling.
		await waitFor(
			() =>
				manager
					.getMessages({ sessionId, limit: 200 })
					.items.some(
						(envelope) =>
							envelope.frame.kind === "update" &&
							envelope.frame.update.sessionUpdate === "tool_call",
					),
			10_000,
			"the hang tool call to journal",
		);

		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");

		const state = manager.get(sessionId);
		expect(state.status).toBe("idle");
		expect(state.lastStopReason).toBe("cancelled");

		// Nothing may render as running forever: the orphaned tool call was
		// journaled to a terminal status when the turn ended.
		const page = manager.getMessages({ sessionId, limit: 200 });
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const hangTool = timeline.items.find((item) => item.kind === "tool_call");
		if (!hangTool || hangTool.kind !== "tool_call") {
			throw new Error("hang tool call missing from timeline");
		}
		expect(hangTool.call.status).toBe("failed");
	}, 30_000);

	test("adapter crash: session reports dead but stays readable; siblings are untouched", async () => {
		const manager = newManager();
		const sessionId = "e2e-survivor";
		const doomedId = "e2e-doomed";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });
		await manager.create({ sessionId: doomedId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId: doomedId,
			prompt: [{ type: "text", text: "crash" }],
		});
		await expect(turn).rejects.toThrow();
		await waitFor(
			() => manager.get(doomedId).status === "dead",
			10_000,
			"the doomed session to report dead",
		);

		// Dead sessions stay discoverable with a readable transcript.
		const listed = manager.list({}).items.map((state) => state.sessionId);
		expect(listed).toContain(doomedId);
		expect(listed).toContain(sessionId);
		const dead = manager.get(doomedId);
		expect(dead.lastError).toContain("adapter");
		const page = manager.getMessages({ sessionId: doomedId, limit: 200 });
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		expect(agentText(timeline)).toContain("about to crash");
		// The tool call left open by the crash was terminalized.
		const crashTool = timeline.items.find((item) => item.kind === "tool_call");
		if (!crashTool || crashTool.kind !== "tool_call") {
			throw new Error("crash tool call missing from timeline");
		}
		expect(crashTool.call.status).toBe("failed");

		expect(() =>
			manager.prompt({
				sessionId: doomedId,
				prompt: [{ type: "text", text: "say hello?" }],
			}),
		).toThrow(/dead/);

		// The sibling session still takes turns.
		const { turn: siblingTurn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say still alive" }],
		});
		expect((await siblingTurn).stopReason).toBe("end_turn");
	}, 30_000);

	test("a manager without persistence drops its runtime when replaced", async () => {
		const manager = newManager();
		const sessionId = "e2e-restart";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });
		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say before restart" }],
		});
		await turn;
		const preRestartSeq = manager.get(sessionId).lastSeq;
		expect(preRestartSeq).toBeGreaterThan(0);

		// This manager deliberately has no persistence injection. Replacing it
		// proves the optional memory-only mode does not fabricate recovery.
		await manager.dispose();
		const restarted = newManager();
		const baseUrl = await startServer(restarted);

		// A client reconnecting with its old cursor learns the session is gone…
		const staleStream = connect({
			baseUrl,
			sessionId,
			since: preRestartSeq,
		});
		await waitFor(
			() => staleStream.resets.length > 0,
			10_000,
			"the stale subscriber's reset frame",
		);
		expect(staleStream.resets).toEqual(["session_not_found"]);

		// The caller can create a different native session under the same public id
		// and resync from scratch with a fresh journal from 1.
		await restarted.create({ sessionId, workspaceId: WORKSPACE_ID });
		const fresh = connect({ baseUrl, sessionId, since: 0 });
		const { turn: freshTurn } = restarted.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say back online" }],
		});
		expect((await freshTurn).stopReason).toBe("end_turn");
		await waitFor(
			() => fresh.received.at(-1)?.seq === restarted.get(sessionId).lastSeq,
			10_000,
			"the fresh stream to catch up",
		);
		expectGapless(fresh.received);
		const timeline = foldEnvelopes(emptyTimeline(), fresh.received);
		const text = agentText(timeline);
		expect(text).toContain("back online");
		expect(text).not.toContain("before restart");
	}, 30_000);

	test("stale cursor after eviction: reset frame, then reconnect from lastSeq goes live", async () => {
		// A tiny ring guarantees seq 1 is evicted after a few turns.
		const manager = newManager({ journalCapacity: 8 });
		const baseUrl = await startServer(manager);
		const sessionId = "e2e-evicted";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });
		for (let i = 1; i <= 5; i += 1) {
			const { turn } = manager.prompt({
				sessionId,
				prompt: [{ type: "text", text: `say filler-${i}` }],
			});
			await turn;
		}

		// since=1 is unservable now — the subscriber gets a reset and must
		// resync out of band instead of silently missing frames.
		const stale = connect({ baseUrl, sessionId, since: 1 });
		await waitFor(
			() => stale.resets.length > 0,
			10_000,
			"the evicted cursor's reset frame",
		);
		expect(stale.resets).toEqual(["journal_evicted"]);

		// Resync: snapshot state, then subscribe from its lastSeq — only new
		// envelopes flow, starting exactly at lastSeq + 1.
		const resyncSeq = manager.get(sessionId).lastSeq;
		const live = connect({ baseUrl, sessionId, since: resyncSeq });
		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say after resync" }],
		});
		await turn;
		await waitFor(
			() => live.received.at(-1)?.seq === manager.get(sessionId).lastSeq,
			10_000,
			"live envelopes after resync",
		);
		expect(live.resets).toEqual([]);
		expect(live.received[0]?.seq).toBe(resyncSeq + 1);
		const text = agentText(foldEnvelopes(emptyTimeline(), live.received));
		expect(text).toContain("after resync");
		expect(text).not.toContain("filler-1");
	}, 30_000);

	test("prompt rejection is non-fatal: journaled, bubble marked failed, session recovers", async () => {
		const manager = newManager();
		const sessionId = "e2e-reject";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "reject boom" }],
		});
		// The SDK maps a thrown handler error to a generic internal error on the
		// requester's side (details ride error.data), so assert loosely here and
		// precisely on the journaled frame below.
		await expect(turn).rejects.toThrow();

		const state = manager.get(sessionId);
		expect(state.status).toBe("idle");
		expect(state.lastError).toBeTruthy();

		const page = manager.getMessages({ sessionId, limit: 200 });
		const rejected = page.items.find(
			(envelope) => envelope.frame.kind === "prompt_rejected",
		);
		if (!rejected || rejected.frame.kind !== "prompt_rejected") {
			throw new Error("prompt_rejected frame missing from journal");
		}
		expect(rejected.frame.promptStartSeq).toBeGreaterThan(0);
		expect(rejected.frame.reason.length).toBeGreaterThan(0);
		// fold repaints the rejected prompt's user bubble as failed.
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const bubble = timeline.items.find(
			(item) => item.kind === "message" && item.role === "user",
		);
		if (!bubble || bubble.kind !== "message") {
			throw new Error("user bubble missing from timeline");
		}
		expect(bubble.failed).toBe(true);

		// The session is still alive and takes the next turn cleanly.
		const { turn: recovery } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say recovered" }],
		});
		expect((await recovery).stopReason).toBe("end_turn");
		const after = manager.get(sessionId);
		expect(after.lastError).toBeNull();
		expect(after.lastStopReason).toBe("end_turn");
		const text = agentText(
			foldEnvelopes(
				emptyTimeline(),
				manager.getMessages({ sessionId, limit: 200 }).items,
			),
		);
		expect(text).toContain("recovered");
	}, 30_000);

	test("create is idempotent per (sessionId, workspaceId); mismatches conflict", async () => {
		const workspaceResolutions: string[] = [];
		const manager = new AcpSessionManager({
			resolveWorkspaceCwd: (workspaceId) => {
				workspaceResolutions.push(workspaceId);
				return workspaceDir;
			},
			adapterEntry: FAKE_ADAPTER,
		});
		managers.push(manager);
		const sessionId = "e2e-idempotent";

		// Two concurrent creates coalesce onto one spawn.
		const [first, second] = await Promise.all([
			manager.create({ sessionId, workspaceId: WORKSPACE_ID }),
			manager.create({ sessionId, workspaceId: WORKSPACE_ID }),
		]);
		expect(workspaceResolutions).toEqual([WORKSPACE_ID]);
		expect(second?.createdAt).toBe(first?.createdAt ?? Number.NaN);

		// Replaying the create later returns the same session, no new spawn.
		const replay = await manager.create({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		expect(replay.createdAt).toBe(first?.createdAt ?? Number.NaN);
		expect(workspaceResolutions).toEqual([WORKSPACE_ID]);
		expect(manager.list({}).items).toHaveLength(1);

		// Same id in a different workspace conflicts — against a live runtime…
		await expect(
			manager.create({ sessionId, workspaceId: "some-other-workspace" }),
		).rejects.toThrow(AcpWorkspaceMismatchError);

		// …and against a create still in flight.
		const inflight = manager.create({
			sessionId: "e2e-idempotent-race",
			workspaceId: WORKSPACE_ID,
		});
		await expect(
			manager.create({
				sessionId: "e2e-idempotent-race",
				workspaceId: "some-other-workspace",
			}),
		).rejects.toThrow(AcpWorkspaceMismatchError);
		await inflight;
	}, 30_000);

	test("setMode and setConfigOption round-trip through the adapter", async () => {
		const manager = newManager();
		const sessionId = "e2e-config";
		const created = await manager.create({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});

		// The real catalog rode session/new: mode + model + fast (fast as the
		// two-value select fallback — our initialize never declares
		// session.configOptions.boolean, so the boolean toggle shape can't occur
		// against the real adapter either).
		expect(created.configOptions.map((option) => option.id)).toEqual([
			"mode",
			"model",
			"fast",
		]);
		expect(configValue(created, "model")).toBe("claude-opus-4-6");
		expect(configValue(created, "fast")).toBe("off");

		await manager.setMode({ sessionId, modeId: "acceptEdits" });
		expect(manager.get(sessionId).currentMode?.currentModeId).toBe(
			"acceptEdits",
		);
		// The switch reached the adapter process, not just local state.
		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "mode" }],
		});
		await turn;
		const text = agentText(
			foldEnvelopes(
				emptyTimeline(),
				manager.getMessages({ sessionId, limit: 200 }).items,
			),
		);
		expect(text).toContain("mode:acceptEdits");

		// The refreshed catalog rides the set_config_option response into state.
		await manager.setConfigOption({
			sessionId,
			configId: "model",
			value: "claude-sonnet-4-5",
		});
		expect(configValue(manager.get(sessionId), "model")).toBe(
			"claude-sonnet-4-5",
		);
		await manager.setConfigOption({ sessionId, configId: "fast", value: "on" });
		expect(configValue(manager.get(sessionId), "fast")).toBe("on");
	}, 30_000);

	test("cancel with a pending permission card settles it cancelled", async () => {
		const manager = newManager();
		const sessionId = "e2e-cancel-pending";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "permission risky-op" }],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"the permission card",
		);
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");

		const state = manager.get(sessionId);
		expect(state.pendingPermissions).toEqual([]);
		expect(state.status).toBe("idle");

		const page = manager.getMessages({ sessionId, limit: 200 });
		const resolved = page.items.find(
			(envelope) => envelope.frame.kind === "permission_resolved",
		);
		if (!resolved || resolved.frame.kind !== "permission_resolved") {
			throw new Error("permission_resolved frame missing from journal");
		}
		expect(resolved.frame.outcome).toEqual({ outcome: "cancelled" });
		// The tool call behind the card never reached a terminal status on its
		// own, so the turn end terminalized it.
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const tool = timeline.items.find((item) => item.kind === "tool_call");
		if (!tool || tool.kind !== "tool_call") {
			throw new Error("tool call missing from timeline");
		}
		expect(tool.call.status).toBe("failed");
	}, 30_000);

	test("cancel while two permission requests are pending settles and terminalizes both", async () => {
		const manager = newManager();
		const sessionId = "e2e-cancel-concurrent-permissions";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "permissions first-op,second-op" }],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length === 2,
			10_000,
			"both permission cards before cancel",
		);
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);
		expect(manager.get(sessionId).status).toBe("idle");

		const page = manager.getMessages({ sessionId, limit: 200 });
		const resolved = page.items.filter(
			(envelope) => envelope.frame.kind === "permission_resolved",
		);
		expect(resolved).toHaveLength(2);
		expect(
			resolved.every(
				(envelope) =>
					envelope.frame.kind === "permission_resolved" &&
					envelope.frame.outcome.outcome === "cancelled",
			),
		).toBe(true);
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const tools = timeline.items.filter((item) => item.kind === "tool_call");
		expect(tools).toHaveLength(2);
		expect(tools.every((item) => item.call.status === "failed")).toBe(true);
	}, 30_000);

	test("cancel during AskUserQuestion clears the card and never opens the next question", async () => {
		const manager = newManager();
		const sessionId = "e2e-cancel-question";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "ask-two first question|yes, no;second question|left, right",
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length === 1,
			10_000,
			"the first question card",
		);
		expect(manager.get(sessionId).pendingPermissions[0]?.toolCall.title).toBe(
			"first question",
		);
		await manager.cancel({ sessionId });
		expect((await turn).stopReason).toBe("cancelled");
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);

		const page = manager.getMessages({ sessionId, limit: 200 });
		expect(
			page.items.filter(
				(envelope) => envelope.frame.kind === "permission_requested",
			),
		).toHaveLength(1);
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const questionTool = timeline.items.find(
			(item) => item.kind === "tool_call",
		);
		if (!questionTool || questionTool.kind !== "tool_call") {
			throw new Error("question tool call missing from timeline");
		}
		expect(questionTool.call.status).toBe("failed");
	}, 30_000);

	test("adapter death with a pending card clears it; answering reports dead", async () => {
		const manager = newManager();
		const sessionId = "e2e-dead-pending";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "permission doomed-op" }],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"the permission card",
		);
		const requestId = manager.get(sessionId).pendingPermissions[0]?.requestId;
		if (!requestId) throw new Error("pending permission disappeared");

		const pid = manager.adapterPid(sessionId);
		if (!pid) throw new Error("adapter pid unavailable");
		process.kill(pid, "SIGKILL");

		await expect(turn).rejects.toThrow();
		await waitFor(
			() => manager.get(sessionId).status === "dead",
			10_000,
			"the session to report dead",
		);
		expect(manager.get(sessionId).pendingPermissions).toEqual([]);
		// A late answer errors loudly instead of pretending to be stale.
		expect(() =>
			manager.respondToPermission({
				sessionId,
				requestId,
				outcome: { outcome: "selected", optionId: "allow" },
			}),
		).toThrow(/dead/);
	}, 30_000);

	test("elicitation edge modes: url is cancelled, empty form is declined — no cards", async () => {
		const manager = newManager();
		const sessionId = "e2e-elicit-edge";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const url = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "ask-url" }],
		});
		expect((await url.turn).stopReason).toBe("end_turn");
		const empty = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "ask-empty" }],
		});
		expect((await empty.turn).stopReason).toBe("end_turn");

		const page = manager.getMessages({ sessionId, limit: 200 });
		// Neither shape can render as a question card, so nothing may block.
		expect(
			page.items.some(
				(envelope) => envelope.frame.kind === "permission_requested",
			),
		).toBe(false);
		const text = agentText(foldEnvelopes(emptyTimeline(), page.items));
		expect(text).toContain("url-elicit:cancel");
		expect(text).toContain("empty-elicit:decline");
	}, 30_000);

	test("two-question form: sequential cards, Skip omits the answer, _custom fields ignored", async () => {
		const manager = newManager();
		const sessionId = "e2e-two-questions";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "ask-two pick color|red, blue;pick size|small, large",
				},
			],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"the first question card",
		);
		const firstCard = manager.get(sessionId).pendingPermissions[0];
		if (!firstCard) throw new Error("first card disappeared");
		// Multi-question forms carry each question in its field description.
		expect(firstCard.toolCall.title).toBe("pick color");
		expect(firstCard.options.map((option) => option.name)).toEqual([
			"red",
			"blue",
			"Skip",
		]);
		manager.respondToPermission({
			sessionId,
			requestId: firstCard.requestId,
			outcome: { outcome: "selected", optionId: "option-0" },
		});

		// The second card only appears once the first resolves.
		await waitFor(
			() =>
				manager.get(sessionId).pendingPermissions[0]?.toolCall.title ===
				"pick size",
			10_000,
			"the second question card",
		);
		const secondCard = manager.get(sessionId).pendingPermissions[0];
		if (!secondCard) throw new Error("second card disappeared");
		manager.respondToPermission({
			sessionId,
			requestId: secondCard.requestId,
			outcome: { outcome: "selected", optionId: "skip" },
		});
		expect((await turn).stopReason).toBe("end_turn");

		const page = manager.getMessages({ sessionId, limit: 200 });
		// A skipped question contributes no answer: the adapter sees the form
		// content without its key at all.
		const text = agentText(foldEnvelopes(emptyTimeline(), page.items));
		expect(text).toContain("picked:red&skipped");
		// Exactly two cards total: the question_<n>_custom "Other" fields the
		// real adapter appends never become cards of their own.
		expect(
			page.items.filter(
				(envelope) => envelope.frame.kind === "permission_requested",
			),
		).toHaveLength(2);
	}, 30_000);

	test("adapter-owned elicitation tool call gets exactly one terminal update", async () => {
		const manager = newManager();
		const sessionId = "e2e-adapter-owned";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "ask-tool deploy now?|yes, no" }],
		});
		await waitFor(
			() => manager.get(sessionId).pendingPermissions.length > 0,
			10_000,
			"the adapter-owned question card",
		);
		const card = manager.get(sessionId).pendingPermissions[0];
		if (!card) throw new Error("question card disappeared");
		// The card is bound to the adapter's real tool call, not a synthetic
		// elicitation-<uuid> stand-in.
		expect(card.toolCall.toolCallId).toMatch(/^tool-\d+$/);
		manager.respondToPermission({
			sessionId,
			requestId: card.requestId,
			outcome: { outcome: "selected", optionId: "option-0" },
		});
		expect((await turn).stopReason).toBe("end_turn");

		const page = manager.getMessages({ sessionId, limit: 200 });
		expect(agentText(foldEnvelopes(emptyTimeline(), page.items))).toContain(
			"picked:yes",
		);
		// The adapter owns the terminal status; the host must not journal a
		// second one of its own (it does for synthetic ids only).
		const terminalUpdates = page.items.filter(
			(envelope) =>
				envelope.frame.kind === "update" &&
				envelope.frame.update.sessionUpdate === "tool_call_update" &&
				(envelope.frame.update.status === "completed" ||
					envelope.frame.update.status === "failed"),
		);
		expect(terminalUpdates).toHaveLength(1);
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		const tool = timeline.items.find((item) => item.kind === "tool_call");
		if (!tool || tool.kind !== "tool_call") {
			throw new Error("tool call missing from timeline");
		}
		expect(tool.call.status).toBe("completed");
	}, 30_000);

	test("spawned adapters never see ambient Anthropic credentials", async () => {
		const previousApiKey = process.env.ANTHROPIC_API_KEY;
		const previousAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
		process.env.ANTHROPIC_API_KEY = "sk-ambient-secret";
		process.env.ANTHROPIC_AUTH_TOKEN = "ambient-token-secret";
		try {
			// The manager scrubs at spawn time, so the session must be created
			// while the ambient credentials are set.
			const manager = newManager();
			const sessionId = "e2e-env-scrub";
			await manager.create({ sessionId, workspaceId: WORKSPACE_ID });
			for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) {
				const { turn } = manager.prompt({
					sessionId,
					prompt: [{ type: "text", text: `env ${name}` }],
				});
				await turn;
			}
			const text = agentText(
				foldEnvelopes(
					emptyTimeline(),
					manager.getMessages({ sessionId, limit: 200 }).items,
				),
			);
			expect(text).toContain("env:ANTHROPIC_API_KEY=<unset>");
			expect(text).toContain("env:ANTHROPIC_AUTH_TOKEN=<unset>");
			expect(text).not.toContain("secret");
		} finally {
			if (previousApiKey === undefined) {
				delete process.env.ANTHROPIC_API_KEY;
			} else {
				process.env.ANTHROPIC_API_KEY = previousApiKey;
			}
			if (previousAuthToken === undefined) {
				delete process.env.ANTHROPIC_AUTH_TOKEN;
			} else {
				process.env.ANTHROPIC_AUTH_TOKEN = previousAuthToken;
			}
		}
	}, 30_000);

	test("concurrent turns: one turn ending must not terminalize the other's open tool", async () => {
		const manager = newManager();
		const sessionId = "e2e-concurrent";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		const hang = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "hang" }],
		});
		await waitFor(
			() =>
				manager
					.getMessages({ sessionId, limit: 200 })
					.items.some(
						(envelope) =>
							envelope.frame.kind === "update" &&
							envelope.frame.update.sessionUpdate === "tool_call",
					),
			10_000,
			"the hang tool call to journal",
		);

		// A second prompt while the first still runs.
		const say = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say concurrent hello" }],
		});
		expect((await say.turn).stopReason).toBe("end_turn");

		// The say turn ended, but the hang turn is still active — its open tool
		// call must NOT have been swept to a terminal status.
		const midTimeline = foldEnvelopes(
			emptyTimeline(),
			manager.getMessages({ sessionId, limit: 200 }).items,
		);
		const midTool = midTimeline.items.find((item) => item.kind === "tool_call");
		if (!midTool || midTool.kind !== "tool_call") {
			throw new Error("hang tool call missing from timeline");
		}
		expect(midTool.call.status).toBe("in_progress");
		expect(manager.get(sessionId).status).toBe("running");

		// Only when the LAST active turn ends does the sweep run.
		await manager.cancel({ sessionId });
		expect((await hang.turn).stopReason).toBe("cancelled");
		const endTimeline = foldEnvelopes(
			emptyTimeline(),
			manager.getMessages({ sessionId, limit: 200 }).items,
		);
		const endTool = endTimeline.items.find((item) => item.kind === "tool_call");
		if (!endTool || endTool.kind !== "tool_call") {
			throw new Error("hang tool call missing from timeline");
		}
		expect(endTool.call.status).toBe("failed");
		expect(manager.get(sessionId).status).toBe("idle");
	}, 30_000);

	test("dead-session graveyard evicts the oldest beyond the cap", async () => {
		const manager = newManager();
		const sessionIds = Array.from(
			{ length: 21 },
			(_, index) => `e2e-grave-${index}`,
		);
		await Promise.all(
			sessionIds.map((id) =>
				manager.create({ sessionId: id, workspaceId: WORKSPACE_ID }),
			),
		);
		// Kill in order, waiting out each death so updatedAt (the eviction
		// order) is strictly increasing.
		for (const id of sessionIds) {
			const pid = manager.adapterPid(id);
			if (!pid) throw new Error(`adapter pid unavailable for ${id}`);
			process.kill(pid, "SIGKILL");
			await waitFor(
				() => manager.get(id).status === "dead",
				10_000,
				`${id} to report dead`,
			);
			await sleep(5);
		}

		// 21 dead > the 20-session graveyard: the first death was evicted.
		const listed = manager.list({ limit: 50 }).items;
		expect(listed).toHaveLength(20);
		expect(listed.every((state) => state.status === "dead")).toBe(true);
		expect(listed.map((state) => state.sessionId)).not.toContain("e2e-grave-0");
		expect(() => manager.get("e2e-grave-0")).toThrow(AcpSessionNotFoundError);
		expect(() => manager.get("e2e-grave-1")).not.toThrow();
	}, 60_000);

	test("list paginates by cursor and filters by workspace", async () => {
		const manager = newManager();
		const older = ["e2e-page-a0", "e2e-page-a1", "e2e-page-a2"];
		const newer = ["e2e-page-b0", "e2e-page-b1"];
		for (const id of older) {
			await manager.create({ sessionId: id, workspaceId: "ws-list-a" });
			await sleep(5);
		}
		for (const id of newer) {
			await manager.create({ sessionId: id, workspaceId: "ws-list-b" });
			await sleep(5);
		}

		// Newest first, two per page, cursors resuming exactly.
		const pageOne = manager.list({ limit: 2 });
		expect(pageOne.enabled).toBe(true);
		expect(pageOne.items.map((state) => state.sessionId)).toEqual([
			"e2e-page-b1",
			"e2e-page-b0",
		]);
		if (!pageOne.nextCursor) throw new Error("expected a second page");
		const pageTwo = manager.list({ limit: 2, cursor: pageOne.nextCursor });
		expect(pageTwo.items.map((state) => state.sessionId)).toEqual([
			"e2e-page-a2",
			"e2e-page-a1",
		]);
		if (!pageTwo.nextCursor) throw new Error("expected a third page");
		const pageThree = manager.list({ limit: 2, cursor: pageTwo.nextCursor });
		expect(pageThree.items.map((state) => state.sessionId)).toEqual([
			"e2e-page-a0",
		]);
		expect(pageThree.nextCursor).toBeNull();

		const filtered = manager.list({ workspaceId: "ws-list-b" });
		expect(filtered.items.map((state) => state.sessionId)).toEqual([
			"e2e-page-b1",
			"e2e-page-b0",
		]);
	}, 30_000);

	test("session_info_update with title: null clears the title", async () => {
		const manager = newManager();
		const sessionId = "e2e-title-clear";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		await manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "title temp-title" }],
		}).turn;
		expect(manager.get(sessionId).title).toBe("temp-title");

		await manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "title-clear" }],
		}).turn;
		expect(manager.get(sessionId).title).toBeNull();
	}, 30_000);

	test("a throwing subscriber does not break the turn or its siblings", async () => {
		const manager = newManager();
		const sessionId = "e2e-subscriber-throw";
		await manager.create({ sessionId, workspaceId: WORKSPACE_ID });

		// Live-only (no since): its throws hit the journal fan-out, which must
		// isolate them.
		const unsubscribeThrowing = manager.subscribe({
			sessionId,
			onEnvelope: () => {
				throw new Error("subscriber exploded");
			},
		});
		const received: SessionUpdateEnvelope[] = [];
		const unsubscribe = manager.subscribe({
			sessionId,
			since: 0,
			onEnvelope: (envelope) => received.push(envelope),
		});

		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text: "say unbothered" }],
		});
		expect((await turn).stopReason).toBe("end_turn");
		expect(agentText(foldEnvelopes(emptyTimeline(), received))).toContain(
			"unbothered",
		);
		expectGapless(received);
		unsubscribeThrowing();
		unsubscribe();
	}, 30_000);
});
