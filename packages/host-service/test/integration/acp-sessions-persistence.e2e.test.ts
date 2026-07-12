/**
 * ACP session persistence e2e (fake adapter): the SQLite session registry
 * (SqliteAcpSessionPersistence over the real migrations) carried across
 * manager "restarts" — same DB handle, fresh AcpSessionManager — exercising
 * the offline status, ensureLive resurrection via the adapter's
 * session/load transcript replay, re-issued create() idempotency across a
 * restart, failed loads staying offline, the WS stream route resurrecting
 * on attach, and the tRPC router resurrecting through getMessages/prompt.
 */
import { Database as BunDatabase } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
	emptyTimeline,
	foldEnvelopes,
	type SessionUpdateEnvelope,
	type Timeline,
} from "@superset/session-protocol";
import {
	type SessionSubscription,
	subscribeToSession,
} from "@superset/session-protocol/client";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import type { HostDb } from "../../src/db";
import * as schema from "../../src/db/schema";
import {
	AcpSessionManager,
	AcpSessionNotFoundError,
	AcpWorkspaceMismatchError,
	registerAcpSessionStreamRoute,
	SqliteAcpSessionPersistence,
} from "../../src/runtime/acp-sessions";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

const FAKE_ADAPTER = path.join(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);
const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");
const WORKSPACE_ID = "acp-persist-workspace";

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

function messageText(timeline: Timeline, role: "agent" | "user"): string {
	return timeline.items
		.filter((item) => item.kind === "message" && item.role === role)
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

describe("acp-sessions persistence e2e (fake adapter)", () => {
	const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "acp-persist-"));
	// One bun:sqlite handle for the whole suite: a "restart" is a fresh
	// AcpSessionManager over the same persistence — anything a new manager
	// sees must have come from the DB rows, never from manager memory.
	const sqlite = new BunDatabase(":memory:");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	const persistence = new SqliteAcpSessionPersistence(db);

	const managers: AcpSessionManager[] = [];
	const servers: ServerType[] = [];
	const subscriptions: SessionSubscription[] = [];
	const hosts: TestHost[] = [];

	function newManager(options?: { journalCapacity?: number }) {
		const manager = new AcpSessionManager({
			resolveWorkspaceCwd: () => workspaceDir,
			adapterEntry: FAKE_ADAPTER,
			persistence,
			journalCapacity: options?.journalCapacity,
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

	/** Run one scripted turn and wait for it to land. */
	async function runTurn(
		manager: AcpSessionManager,
		sessionId: string,
		text: string,
	): Promise<void> {
		const { turn } = manager.prompt({
			sessionId,
			prompt: [{ type: "text", text }],
		});
		const { stopReason } = await turn;
		expect(stopReason).toBe("end_turn");
	}

	function foldedMessages(
		manager: AcpSessionManager,
		sessionId: string,
	): Timeline {
		const page = manager.getMessages({ sessionId, limit: 500 });
		return foldEnvelopes(emptyTimeline(), page.items);
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
		for (const host of hosts.splice(0)) {
			await host.dispose();
		}
		await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
		sqlite.close();
		try {
			rmSync(workspaceDir, { recursive: true, force: true });
		} catch {
			// best-effort
		}
	});

	test("a session survives a manager restart: offline in list, resurrected by ensureLive with the replayed transcript", async () => {
		const sessionId = "persist-restart";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say hello before restart");
		await runTurn(before, sessionId, "title Persisted Title");
		const stateBefore = before.get(sessionId);
		expect(stateBefore.title).toBe("Persisted Title");
		await before.dispose();

		const after = newManager();
		// Passive reads see the registry row, not a process.
		const listed = after
			.list({})
			.items.find((state) => state.sessionId === sessionId);
		if (!listed) throw new Error("restarted manager lost the session");
		expect(listed.status).toBe("offline");
		expect(listed.title).toBe("Persisted Title");
		expect(listed.lastStopReason).toBe("end_turn");
		expect(listed.createdAt).toBe(stateBefore.createdAt);
		expect(after.get(sessionId).status).toBe("offline");
		// The manager itself stays passive — resurrection is the caller's
		// explicit ensureLive (the router/stream boundaries), not getMessages.
		expect(() => after.getMessages({ sessionId })).toThrow(
			AcpSessionNotFoundError,
		);

		// ensureLive is idempotent under concurrency (deduped like create) and
		// a no-op for ids the registry has never seen.
		await Promise.all([
			after.ensureLive(sessionId),
			after.ensureLive(sessionId),
			after.ensureLive("never-created"),
		]);
		const resurrected = after.get(sessionId);
		expect(resurrected.status).toBe("idle");
		expect(resurrected.title).toBe("Persisted Title");
		expect(resurrected.createdAt).toBe(stateBefore.createdAt);
		// D14-c on load: the adapter comes back in bypassPermissions; the
		// manager must force it out of bypass.
		expect(resurrected.currentMode?.currentModeId).toBe("default");
		// ensureLive on an already-live session must not respawn the adapter.
		const pid = after.adapterPid(sessionId);
		await after.ensureLive(sessionId);
		expect(after.adapterPid(sessionId)).toBe(pid);

		// session/load replayed the stored transcript — both sides of the
		// pre-restart conversation fold out of the fresh journal…
		const timeline = foldedMessages(after, sessionId);
		expect(messageText(timeline, "user")).toContain("say hello before restart");
		expect(messageText(timeline, "agent")).toContain("hello before restart");
		// …and the journal is a fresh gapless incarnation from seq 1.
		const replayed: SessionUpdateEnvelope[] = [];
		const unsubscribe = after.subscribe({
			sessionId,
			since: 0,
			onEnvelope: (envelope) => replayed.push(envelope),
		});
		expectGapless(replayed);
		unsubscribe();

		// The resurrected session takes new turns.
		await runTurn(after, sessionId, "say hello after restart");
		expect(messageText(foldedMessages(after, sessionId), "agent")).toContain(
			"hello after restart",
		);
	}, 30_000);

	test("session/load bounds its pre-runtime replay to the configured catch-up window", async () => {
		const sessionId = "persist-bounded-replay";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		for (let turn = 1; turn <= 6; turn += 1) {
			await runTurn(before, sessionId, `say replay-marker-${turn}`);
		}
		await before.dispose();

		const after = newManager({ journalCapacity: 4 });
		await after.ensureLive(sessionId);
		const page = after.getMessages({ sessionId, limit: 100 });
		expect(page.items.length).toBeLessThanOrEqual(4);
		const text = messageText(
			foldEnvelopes(emptyTimeline(), page.items),
			"agent",
		);
		expect(text).toContain("replay-marker-6");
		expect(text).not.toContain("replay-marker-1");
	}, 30_000);

	test("create() re-issued after a restart resurrects the same adapter session; mismatched workspace conflicts", async () => {
		const sessionId = "persist-recreate";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say marker-one");
		await before.dispose();

		const after = newManager();
		await expect(
			after.create({ sessionId, workspaceId: "some-other-workspace" }),
		).rejects.toBeInstanceOf(AcpWorkspaceMismatchError);

		// The client's normal open flow — create, then read — needs no
		// explicit ensureLive: create resurrects.
		const created = await after.create({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		expect(created.status).toBe("idle");
		expect(messageText(foldedMessages(after, sessionId), "agent")).toContain(
			"marker-one",
		);
	}, 30_000);

	test("a failed session/load leaves the session offline and surfaces the error", async () => {
		const sessionId = "persist-broken";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say doomed");
		await before.dispose();

		// Break the harness-side store (the fake's stand-in for Claude Code's
		// on-disk session files) for exactly this session.
		const record = persistence
			.loadAll()
			.find((row) => row.sessionId === sessionId);
		if (!record) throw new Error("registry row missing");
		rmSync(
			path.join(
				workspaceDir,
				".fake-acp-store",
				`${record.acpSessionId}.jsonl`,
			),
		);

		const after = newManager();
		await expect(after.ensureLive(sessionId)).rejects.toThrow(/load/i);
		// Still offline, still listed — the row is kept for a later retry.
		expect(after.get(sessionId).status).toBe("offline");
		expect(after.list({}).items.map((state) => state.sessionId)).toContain(
			sessionId,
		);
		// And the failure is retryable, not a poisoned inflight entry.
		await expect(after.ensureLive(sessionId)).rejects.toThrow(/load/i);

		// The stream route reports the failed load as a reset instead of
		// hanging the socket.
		const baseUrl = await startServer(after);
		const resets: string[] = [];
		subscriptions.push(
			subscribeToSession({
				streamUrl: `${baseUrl}/acp-sessions/${sessionId}/stream`,
				since: 0,
				onEnvelope: () => {},
				onReset: (reason) => resets.push(reason),
			}),
		);
		await waitFor(
			() => resets.includes("session_load_failed"),
			10_000,
			"a session_load_failed reset",
		);
	}, 30_000);

	test("a WS subscriber attaching to an offline session resurrects it and replays from seq 1", async () => {
		const sessionId = "persist-stream";
		const before = newManager();
		await before.create({ sessionId, workspaceId: WORKSPACE_ID });
		await runTurn(before, sessionId, "say stream-marker");
		await before.dispose();

		const after = newManager();
		expect(after.get(sessionId).status).toBe("offline");
		const baseUrl = await startServer(after);
		const received: SessionUpdateEnvelope[] = [];
		subscriptions.push(
			subscribeToSession({
				streamUrl: `${baseUrl}/acp-sessions/${sessionId}/stream`,
				since: 0,
				onEnvelope: (envelope) => received.push(envelope),
			}),
		);
		await waitFor(
			() =>
				received.some(
					(envelope) =>
						envelope.frame.kind === "update" &&
						envelope.frame.update.sessionUpdate === "agent_message_chunk",
				),
			10_000,
			"the replayed transcript over the stream",
		);
		expectGapless(received);
		const timeline = foldEnvelopes(
			emptyTimeline(),
			received.filter((envelope) => envelope.frame.kind !== "state"),
		);
		expect(messageText(timeline, "agent")).toContain("stream-marker");
		expect(after.get(sessionId).status).toBe("idle");
	}, 30_000);

	test("router: getMessages and prompt resurrect through the tRPC boundary after a host restart", async () => {
		const sessionId = "persist-router";
		const managerBefore = newManager();
		const hostBefore = await createTestHost({ acpSessions: managerBefore });
		await hostBefore.trpc.acpSessions.create.mutate({
			sessionId,
			workspaceId: WORKSPACE_ID,
		});
		await hostBefore.trpc.acpSessions.prompt.mutate({
			sessionId,
			prompt: [{ type: "text", text: "say router-marker" }],
		});
		await waitFor(
			() => {
				const state = managerBefore.get(sessionId);
				return state.status === "idle" && state.lastStopReason === "end_turn";
			},
			10_000,
			"the pre-restart turn to land",
		);
		// Disposing the app kills the injected manager's adapter processes —
		// the host-restart half of the scenario.
		await hostBefore.dispose();

		const managerAfter = newManager();
		const hostAfter = await createTestHost({ acpSessions: managerAfter });
		hosts.push(hostAfter);

		const listed = await hostAfter.trpc.acpSessions.list.query({});
		expect(
			listed.items.find((state) => state.sessionId === sessionId)?.status,
		).toBe("offline");

		// No explicit resurrect call anywhere: the router's ensureLive boundary
		// must bring the session back for a plain getMessages…
		const page = await hostAfter.trpc.acpSessions.getMessages.query({
			sessionId,
			limit: 200,
		});
		const timeline = foldEnvelopes(emptyTimeline(), page.items);
		expect(messageText(timeline, "agent")).toContain("router-marker");
		expect(
			(await hostAfter.trpc.acpSessions.get.query({ sessionId })).status,
		).toBe("idle");

		// …and the session keeps working.
		const ack = await hostAfter.trpc.acpSessions.prompt.mutate({
			sessionId,
			prompt: [{ type: "text", text: "say back from the dead" }],
		});
		expect(ack).toEqual({ accepted: true });
		await waitFor(
			() => {
				const state = managerAfter.get(sessionId);
				return state.status === "idle" && state.lastStopReason === "end_turn";
			},
			10_000,
			"the post-restart turn to land",
		);
	}, 30_000);
});
