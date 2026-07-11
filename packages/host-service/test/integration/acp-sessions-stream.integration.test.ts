/**
 * PRIMARY ACP stream acceptance lane: the real WS route serves a real
 * `claude-agent-acp` adapter and real Claude model, consumed through the real
 * `subscribeToSession` client.
 *
 * Run this on an authenticated Mac whenever changing the ACP runtime, adapter
 * bridge, stream route/client, reconnect, sequencing, or cancellation. It is
 * gated only because CI does not have a Claude login and it spends real tokens;
 * deterministic adapter tests are regression backup, not a substitute.
 *
 *   ACP_E2E=1 ACP_E2E_MODEL=sonnet ACP_E2E_EFFORT=low \
 *     bun test test/integration/acp-sessions-stream.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
	emptyTimeline,
	foldEnvelopes,
	type SessionUpdateEnvelope,
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

const RUN = process.env.ACP_E2E === "1";
const E2E_MODEL = process.env.ACP_E2E_MODEL ?? "sonnet";
const E2E_EFFORT = process.env.ACP_E2E_EFFORT ?? "low";

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
		await sleep(100);
	}
}

function expectGapless(envelopes: SessionUpdateEnvelope[], fromSeq: number) {
	expect(envelopes.length).toBeGreaterThan(0);
	expect(envelopes[0]?.seq).toBe(fromSeq);
	for (let i = 1; i < envelopes.length; i += 1) {
		expect(envelopes[i]?.seq).toBe((envelopes[i - 1]?.seq ?? 0) + 1);
	}
}

describe.skipIf(!RUN)("acp-sessions WS stream (real adapter)", () => {
	let workspaceDir: string;
	let manager: AcpSessionManager;
	let evictManager: AcpSessionManager;
	const servers: ServerType[] = [];
	const subscriptions: SessionSubscription[] = [];
	const sessionId = "acp-m3-stream";
	const evictSessionId = "acp-m3-evict";
	const workspaceId = "acp-m3-workspace";

	async function startServer(source: AcpSessionManager): Promise<string> {
		const app = new Hono();
		const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
		registerAcpSessionStreamRoute({ app, sessions: source, upgradeWebSocket });
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
	}): { subscription: SessionSubscription; received: SessionUpdateEnvelope[] } {
		const received: SessionUpdateEnvelope[] = [];
		const subscription = subscribeToSession({
			streamUrl: `${options.baseUrl}/acp-sessions/${options.sessionId}/stream`,
			since: options.since,
			onEnvelope: (envelope) => received.push(envelope),
			onReset: options.onReset,
		});
		subscriptions.push(subscription);
		return { subscription, received };
	}

	async function configureRealModel(
		source: AcpSessionManager,
		id: string,
	): Promise<void> {
		const session = source.get(id);
		const model = session.configOptions.find(
			(option) => option.id === "model" && option.type === "select",
		);
		if (!model || !model.options.some((option) => option.value === E2E_MODEL)) {
			throw new Error(
				`ACP_E2E_MODEL=${E2E_MODEL} is unavailable; adapter offered ${model?.options.map((option) => option.value).join(", ") ?? "no model catalog"}`,
			);
		}
		await source.setConfigOption({
			sessionId: id,
			configId: "model",
			value: E2E_MODEL,
		});
		const effort = source
			.get(id)
			.configOptions.find(
				(option) => option.id === "effort" && option.type === "select",
			);
		if (effort?.options.some((option) => option.value === E2E_EFFORT)) {
			await source.setConfigOption({
				sessionId: id,
				configId: "effort",
				value: E2E_EFFORT,
			});
		}
	}

	beforeAll(() => {
		workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-m3-"));
		execSync(
			"git init -q && git -c user.email=m3@superset.sh -c user.name=m3 commit -q --allow-empty -m init",
			{ cwd: workspaceDir },
		);
		manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
		});
		evictManager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
			journalCapacity: 10,
		});
	});

	afterAll(async () => {
		for (const subscription of subscriptions.splice(0)) {
			subscription.close();
		}
		await manager.dispose();
		await evictManager.dispose();
		for (const server of servers.splice(0)) {
			(
				server as unknown as { closeAllConnections?: () => void }
			).closeAllConnections?.();
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		}
	});

	test("two concurrent WS subscribers see the identical gapless stream of a live turn", async () => {
		await manager.create({ sessionId, workspaceId });
		await configureRealModel(manager, sessionId);
		const baseUrl = await startServer(manager);

		const a = connect({ baseUrl, sessionId, since: 0 });
		const b = connect({ baseUrl, sessionId, since: 0 });

		const { stopReason } = await manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Reply with exactly the text M3_STREAM_OK and nothing else.",
				},
			],
		}).turn;
		expect(stopReason).toBe("end_turn");

		// The adapter can keep emitting trailing frames after the prompt
		// resolves, so subscribers may overshoot this snapshot — wait with >=
		// and compare only the deterministic prefix up to the snapshot.
		const finalSeq = manager.get(sessionId).lastSeq;
		await waitFor(
			() =>
				a.subscription.lastSeq >= finalSeq &&
				b.subscription.lastSeq >= finalSeq,
			30_000,
			"both subscribers to reach the turn-end seq",
		);

		const upTo = (envelopes: SessionUpdateEnvelope[]) =>
			envelopes.filter((envelope) => envelope.seq <= finalSeq);
		const aHead = upTo(a.received);
		const bHead = upTo(b.received);
		expectGapless(aHead, 1);
		expect(aHead[aHead.length - 1]?.seq).toBe(finalSeq);
		expect(JSON.stringify(aHead)).toBe(JSON.stringify(bHead));

		// The stream folds into a timeline showing the agent's reply.
		const timeline = foldEnvelopes(emptyTimeline(), aHead);
		const agentText = timeline.items
			.filter((item) => item.kind === "message" && item.role === "agent")
			.flatMap((item) => (item.kind === "message" ? item.blocks : []))
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("");
		expect(agentText).toContain("M3_STREAM_OK");
	}, 300_000);

	test("a subscriber that drops mid-turn resumes from its cursor with no gaps and no duplicates", async () => {
		const baseUrl = await startServer(manager);
		const sinceSeq = manager.get(sessionId).lastSeq;

		const { turn } = manager.prompt({
			sessionId,
			prompt: [
				{
					type: "text",
					text: "Write a haiku about websockets, then a haiku about sequence numbers.",
				},
			],
		});

		const first = connect({ baseUrl, sessionId, since: sinceSeq });
		await waitFor(
			() => first.received.length >= 2,
			120_000,
			"a few mid-turn envelopes",
		);
		first.subscription.close();

		const { stopReason } = await turn;
		expect(stopReason).toBe("end_turn");

		const second = connect({
			baseUrl,
			sessionId,
			since: first.subscription.lastSeq,
		});
		const finalSeq = manager.get(sessionId).lastSeq;
		await waitFor(
			() => second.subscription.lastSeq >= finalSeq,
			30_000,
			"the resumed subscriber to catch up",
		);

		const combined = [...first.received, ...second.received];
		expectGapless(combined, sinceSeq + 1);
		// >= — trailing post-turn frames may land after the snapshot was read.
		expect(combined[combined.length - 1]?.seq).toBeGreaterThanOrEqual(finalSeq);
	}, 300_000);

	test("an evicted cursor yields a reset frame; resyncing from current state re-attaches cleanly", async () => {
		await evictManager.create({ sessionId: evictSessionId, workspaceId });
		await configureRealModel(evictManager, evictSessionId);
		const baseUrl = await startServer(evictManager);

		// Push the 10-slot ring past seq 1 (evicted once latestSeq ≥ 12).
		while (evictManager.get(evictSessionId).lastSeq < 12) {
			await evictManager.prompt({
				sessionId: evictSessionId,
				prompt: [
					{
						type: "text",
						text: "Reply with exactly the text OK and nothing else.",
					},
				],
			}).turn;
		}

		const resets: string[] = [];
		const stale = connect({
			baseUrl,
			sessionId: evictSessionId,
			since: 1,
			onReset: (reason) => {
				resets.push(reason);
			},
		});
		await waitFor(() => resets.length > 0, 30_000, "the reset frame");
		expect(resets[0]).toBe("journal_evicted");
		expect(stale.received).toEqual([]);

		// Resync exactly like a client would: take the current snapshot, then
		// subscribe from its lastSeq. The next turn streams gaplessly from there.
		const state = evictManager.get(evictSessionId);
		const resynced = connect({
			baseUrl,
			sessionId: evictSessionId,
			since: state.lastSeq,
		});
		const { stopReason } = await evictManager.prompt({
			sessionId: evictSessionId,
			prompt: [
				{
					type: "text",
					text: "Reply with exactly the text RESYNCED and nothing else.",
				},
			],
		}).turn;
		expect(stopReason).toBe("end_turn");
		const finalSeq = evictManager.get(evictSessionId).lastSeq;
		await waitFor(
			() => resynced.subscription.lastSeq >= finalSeq,
			30_000,
			"the resynced subscriber to catch up",
		);
		expectGapless(resynced.received, state.lastSeq + 1);
	}, 300_000);
});
