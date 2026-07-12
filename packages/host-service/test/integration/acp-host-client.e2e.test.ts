/**
 * Belt-and-suspenders host-service + @superset/host-client boundary E2E. A tiny
 * local relay
 * mount supplies the production `/hosts/:routingKey/*` prefix, while every
 * command still crosses actual HTTP/SuperJSON/tRPC and every update crosses
 * an actual WebSocket. The ACP model is the deterministic stdio adapter, so
 * this broad always-run suite complements but does not replace the
 * ACP_E2E-gated authenticated real-Claude acceptance lane.
 */
import { Database as BunDatabase } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
	createAcpHostClient,
	createHostTransport,
} from "@superset/host-client";
import {
	emptyTimeline,
	foldEnvelopes,
	type SessionUpdateEnvelope,
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
	registerAcpSessionStreamRoute,
	SqliteAcpSessionPersistence,
} from "../../src/runtime/acp-sessions";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

const FAKE_ADAPTER = path.join(
	import.meta.dir,
	"../fixtures/fake-acp-adapter.ts",
);
const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");
const ROUTING_KEY = "acp-host-client-e2e";
const WORKSPACE_ID = "acp-host-client-workspace";
const PSK = "acp-host-client-test-psk";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (Date.now() > deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
		}
		await sleep(10);
	}
}

async function closeServer(server: ServerType): Promise<void> {
	(
		server as unknown as { closeAllConnections?: () => void }
	).closeAllConnections?.();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}

interface HostGeneration {
	host: TestHost;
	server: ServerType;
	manager: AcpSessionManager;
	baseUrl: string;
}

async function startHostGeneration(
	manager: AcpSessionManager,
): Promise<HostGeneration> {
	const host = await createTestHost({ acpSessions: manager, psk: PSK });
	// The real relay preserves everything after `/hosts/:routingKey`. Rewrite
	// that prefix into the real host app without replacing either side's HTTP,
	// auth, tRPC, or WebSocket implementation.
	const relay = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
		app: relay,
	});
	relay.use("/hosts/:routingKey/acp-sessions/*", async (context, next) => {
		if (context.req.query("token") !== PSK) {
			return context.json({ error: "Unauthorized" }, 401);
		}
		return next();
	});
	registerAcpSessionStreamRoute({
		app: relay,
		sessions: manager,
		upgradeWebSocket,
		path: "/hosts/:routingKey/acp-sessions/:sessionId/stream",
	});
	relay.all("/hosts/:routingKey/*", (context) => {
		const url = new URL(context.req.url);
		const prefix = `/hosts/${context.req.param("routingKey")}`;
		url.pathname = url.pathname.slice(prefix.length) || "/";
		return host.app.fetch(new Request(url, context.req.raw));
	});
	const server = await new Promise<ServerType>((resolve) => {
		const instance = serve({ fetch: relay.fetch, port: 0 }, () =>
			resolve(instance),
		);
	});
	injectWebSocket(server);
	const { port } = server.address() as AddressInfo;
	return {
		host,
		server,
		manager,
		baseUrl: `http://127.0.0.1:${port}`,
	};
}

async function stopHostGeneration(generation: HostGeneration): Promise<void> {
	await closeServer(generation.server);
	await generation.host.dispose();
}

describe("ACP real host + host-client boundary e2e", () => {
	test("question, abort, concurrent permissions, reconnect, DB reopen, resume, and missing native transcript", async () => {
		const workspaceDir = mkdtempSync(
			path.join(os.tmpdir(), "acp-host-client-e2e-"),
		);
		const registryPath = path.join(workspaceDir, "acp-registry.db");
		let sqlite: BunDatabase | null = null;
		let generation: HostGeneration | null = null;
		let subscription: SessionSubscription | null = null;
		let relayUrl = "";
		const streamStatuses: string[] = [];
		const streamResets: string[] = [];
		const streamGaps: Array<{ expected: number; received: number }> = [];

		const openManager = () => {
			sqlite = new BunDatabase(registryPath, { create: true, readwrite: true });
			sqlite.exec("PRAGMA journal_mode = WAL");
			const db = drizzle(sqlite, { schema }) as unknown as HostDb;
			migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
			return new AcpSessionManager({
				resolveWorkspaceCwd: () => workspaceDir,
				adapterEntry: FAKE_ADAPTER,
				persistence: new SqliteAcpSessionPersistence(db),
			});
		};

		const restartHost = async () => {
			if (subscription) {
				subscription.close();
				subscription = null;
			}
			if (generation) {
				await stopHostGeneration(generation);
				generation = null;
			}
			if (sqlite) {
				sqlite.close();
				sqlite = null;
			}
			const manager = openManager();
			generation = await startHostGeneration(manager);
			relayUrl = generation.baseUrl;
			return generation;
		};

		const transport = createHostTransport({
			getRelayUrl: () => relayUrl,
			getToken: async () => PSK,
		});
		const client = createAcpHostClient(transport);
		const api = client.sessionsApi(ROUTING_KEY);

		try {
			await restartHost();
			const sessionId = "host-client-main";
			const initialList = await client.listSessions(ROUTING_KEY, WORKSPACE_ID);
			expect(initialList).toEqual({
				items: [],
				nextCursor: null,
				enabled: true,
			});
			const created = await client.createSession(ROUTING_KEY, {
				sessionId,
				workspaceId: WORKSPACE_ID,
			});
			expect(created.status).toBe("idle");

			const beforeDisconnect: SessionUpdateEnvelope[] = [];
			subscription = subscribeToSession({
				streamUrl: client.streamUrl({ routingKey: ROUTING_KEY, sessionId }),
				since: 0,
				onEnvelope: (envelope) => beforeDisconnect.push(envelope),
				onStatus: (status) => streamStatuses.push(status),
				onReset: (reason) => streamResets.push(reason),
				onGap: (gap) => streamGaps.push(gap),
			});

			// Drive an AskUserQuestion-shaped form through the public client. The
			// question must arrive as a pending permission, accept the selected
			// option, and finish through the live WebSocket stream.
			expect(
				await api.prompt({
					sessionId,
					prompt: [
						{
							type: "text",
							text: "ask-single Pick a fixture color|red,blue",
						},
					],
				}),
			).toEqual({ accepted: true });
			await waitFor(
				async () =>
					(await api.get({ sessionId })).pendingPermissions.length === 1,
				10_000,
				"the question through host-client",
			);
			const question = (await api.get({ sessionId })).pendingPermissions[0];
			if (!question) throw new Error("question card disappeared");
			expect(question.toolCall.title).toBe("Pick a fixture color");
			const blue = question.options.find((option) => option.name === "blue");
			if (!blue) throw new Error("blue question option disappeared");
			expect(
				await api.respondToPermission({
					sessionId,
					requestId: question.requestId,
					outcome: { outcome: "selected", optionId: blue.optionId },
				}),
			).toEqual({ status: "resolved" });
			await waitFor(
				async () => (await api.get({ sessionId })).status === "idle",
				10_000,
				"the answered question turn to finish",
			);
			await waitFor(
				() =>
					foldEnvelopes(emptyTimeline(), beforeDisconnect).items.some(
						(item) =>
							item.kind === "message" &&
							item.role === "agent" &&
							item.blocks.some(
								(block) =>
									block.type === "text" && block.text.includes("picked:blue"),
							),
					),
				10_000,
				"the question answer on the relay WebSocket",
			);

			// Abort an in-flight tool after it has started. This crosses the same
			// host-client command path the mobile Stop button uses and must leave no
			// running tool or pending interaction behind.
			expect(
				await api.prompt({
					sessionId,
					prompt: [{ type: "text", text: "hang" }],
				}),
			).toEqual({ accepted: true });
			await waitFor(
				async () => (await api.get({ sessionId })).status === "running",
				10_000,
				"the cancellable turn to start",
			);
			await api.cancel({ sessionId });
			await waitFor(
				async () => {
					const state = await api.get({ sessionId });
					return (
						state.status === "idle" && state.lastStopReason === "cancelled"
					);
				},
				10_000,
				"the host-client cancellation to settle",
			);
			const afterCancel = foldEnvelopes(
				emptyTimeline(),
				(await api.getMessages({ sessionId, limit: 200 })).items,
			);
			const cancelledTool = afterCancel.items.find(
				(item) => item.kind === "tool_call" && item.call.title === "hang",
			);
			if (!cancelledTool || cancelledTool.kind !== "tool_call") {
				throw new Error("cancelled tool call missing from timeline");
			}
			expect(cancelledTool.call.status).toBe("failed");
			expect((await api.get({ sessionId })).pendingPermissions).toEqual([]);

			expect(
				await api.prompt({
					sessionId,
					prompt: [
						{ type: "text", text: "permissions first-write,second-delete" },
					],
				}),
			).toEqual({ accepted: true });
			await waitFor(
				async () =>
					(await api.get({ sessionId })).pendingPermissions.length === 2,
				10_000,
				"two permissions through host-client",
			);
			try {
				await waitFor(
					() =>
						beforeDisconnect.filter(
							(envelope) => envelope.frame.kind === "permission_requested",
						).length === 3,
					10_000,
					"the question and both permission cards on the relay WebSocket",
				);
			} catch (cause) {
				throw new Error(
					`${cause instanceof Error ? cause.message : String(cause)}; statuses=${JSON.stringify(streamStatuses)} resets=${JSON.stringify(streamResets)} gaps=${JSON.stringify(streamGaps)} frames=${JSON.stringify(beforeDisconnect.map((envelope) => [envelope.seq, envelope.frame.kind]))}`,
				);
			}
			const pending = (await api.get({ sessionId })).pendingPermissions;
			const [first, second] = pending;
			if (!first || !second) throw new Error("permission cards disappeared");
			const disconnectSeq = beforeDisconnect.at(-1)?.seq;
			if (!disconnectSeq) throw new Error("stream had no disconnect cursor");
			subscription.close();
			subscription = null;

			// Resolve while the client is disconnected; reconnect must catch up from
			// the last seen cursor with no duplicate or missing envelope.
			expect(
				await api.respondToPermission({
					sessionId,
					requestId: second.requestId,
					outcome: { outcome: "selected", optionId: "reject" },
				}),
			).toEqual({ status: "resolved" });
			expect(
				await api.respondToPermission({
					sessionId,
					requestId: first.requestId,
					outcome: { outcome: "selected", optionId: "allow" },
				}),
			).toEqual({ status: "resolved" });
			await waitFor(
				async () => (await api.get({ sessionId })).status === "idle",
				10_000,
				"the permission turn to finish while disconnected",
			);

			const afterReconnect: SessionUpdateEnvelope[] = [];
			subscription = subscribeToSession({
				streamUrl: client.streamUrl({ routingKey: ROUTING_KEY, sessionId }),
				since: disconnectSeq,
				onEnvelope: (envelope) => afterReconnect.push(envelope),
			});
			await waitFor(
				() =>
					afterReconnect.some(
						(envelope) =>
							envelope.frame.kind === "state" &&
							envelope.frame.state.status === "idle",
					),
				10_000,
				"the disconnected tail after reconnect",
			);
			expect(afterReconnect[0]?.seq).toBe(disconnectSeq + 1);
			for (let index = 1; index < afterReconnect.length; index += 1) {
				expect(afterReconnect[index]?.seq).toBe(
					(afterReconnect[index - 1]?.seq ?? 0) + 1,
				);
			}
			expect(
				afterReconnect.filter(
					(envelope) => envelope.frame.kind === "permission_resolved",
				),
			).toHaveLength(2);

			// Close the app, server, adapter, and SQLite handle; then reopen the same
			// file. The host-client sees the persisted row passively as offline and a
			// normal history read resurrects it through session/load.
			await restartHost();
			const afterRestart = await client.listSessions(ROUTING_KEY, WORKSPACE_ID);
			expect(
				afterRestart.items.find((item) => item.sessionId === sessionId)?.status,
			).toBe("offline");
			const replayed = await api.getMessages({ sessionId, limit: 200 });
			const replayedTimeline = foldEnvelopes(emptyTimeline(), replayed.items);
			const replayedText = replayedTimeline.items
				.filter((item) => item.kind === "message")
				.flatMap((item) => (item.kind === "message" ? item.blocks : []))
				.map((block) => (block.type === "text" ? block.text : ""))
				.join("\n");
			expect(replayedText).toContain("permissions first-write,second-delete");
			expect((await api.get({ sessionId })).status).toBe("idle");

			// Create a second durable row, then remove only its harness-owned native
			// transcript before another full DB/app/server reopen.
			const brokenSessionId = "host-client-missing-native";
			await client.createSession(ROUTING_KEY, {
				sessionId: brokenSessionId,
				workspaceId: WORKSPACE_ID,
			});
			await api.prompt({
				sessionId: brokenSessionId,
				prompt: [{ type: "text", text: "say doomed-native-session" }],
			});
			await waitFor(
				async () =>
					(await api.get({ sessionId: brokenSessionId })).lastStopReason ===
					"end_turn",
				10_000,
				"the soon-to-be-missing native session to finish",
			);
			if (!sqlite) throw new Error("registry SQLite unexpectedly closed");
			const currentDb = drizzle(sqlite, { schema }) as unknown as HostDb;
			const brokenRecord = new SqliteAcpSessionPersistence(currentDb)
				.loadAll()
				.find((record) => record.sessionId === brokenSessionId);
			if (!brokenRecord) throw new Error("broken session registry row missing");
			await restartHost();
			rmSync(
				path.join(
					workspaceDir,
					".fake-acp-store",
					`${brokenRecord.acpSessionId}.jsonl`,
				),
			);

			await expect(
				api.getMessages({ sessionId: brokenSessionId, limit: 50 }),
			).rejects.toThrow(
				`No stored session to load: ${brokenRecord.acpSessionId}`,
			);
			expect((await api.get({ sessionId: brokenSessionId })).status).toBe(
				"offline",
			);

			const resets: string[] = [];
			subscription = subscribeToSession({
				streamUrl: client.streamUrl({
					routingKey: ROUTING_KEY,
					sessionId: brokenSessionId,
				}),
				since: 0,
				onEnvelope: () => {},
				onReset: (reason) => resets.push(reason),
			});
			await waitFor(
				() => resets.includes("session_load_failed"),
				10_000,
				"session_load_failed through the relay WebSocket",
			);
		} finally {
			subscription?.close();
			if (generation) await stopHostGeneration(generation);
			if (sqlite) sqlite.close();
			rmSync(workspaceDir, { recursive: true, force: true });
		}
	}, 60_000);
});
