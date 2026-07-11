/**
 * Full-stack ACP session e2e against the deterministic fake adapter
 * (test/fixtures/fake-acp-adapter.ts): real AcpSessionManager, real child
 * processes over JSON-RPC/stdio, real Hono/node-ws stream route, real
 * `subscribeToSession` WS client — only the model is fake, so this runs in
 * every `bun test` with no tokens or network.
 *
 * Covers the long-haul paths the ACP_E2E-gated real-adapter test can't
 * afford: a ~30-turn marathon with gapless streams and pagination folds,
 * permission allow/deny, single- and multi-select elicitations, cancel
 * mid-tool-call, adapter crash, host restart (fresh manager, dead cursors),
 * and stale-cursor eviction resyncs.
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
		expect(allowPending.options.map((option) => option.optionId)).toEqual([
			"allow",
			"deny",
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
			outcome: { outcome: "selected", optionId: "deny" },
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

	test("host restart: stale cursors get session_not_found; re-create resyncs from seq 1", async () => {
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

		// "Restart": journals live in memory, so a new manager (fresh host
		// process) knows nothing about the session.
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

		// …then re-creates it and resyncs from scratch: a fresh journal from 1.
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
});
