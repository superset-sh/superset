/**
 * End-to-end wiring test for the Host Sessions client: a real
 * `createSessionsSyncClient` store talking to a real `createApp` host over a
 * real WebSocket (`/sessions/sync`) and real tRPC (`sessions.*`), with only
 * the ACP adapter faked. Deterministic and ungated — this is the CI-grade
 * proof that the client store, wire protocol, hub, tRPC router, and canonical
 * runtime compose into one consistent system.
 *
 * The oracle throughout is PARITY: after every scenario the client's folded
 * zustand store must deep-equal the host's own truth as served over tRPC
 * (`sessions.getEvents` / `sessions.get` / `sessions.list`). No hand-computed
 * expectations — if either side drifts from the contract, they disagree.
 *
 * A second oracle rides along implicitly: the client hard-validates every
 * inbound frame (schema + connection context) and force-closes the socket on
 * any mismatch, so the log capture asserting "no socket drops, only the one
 * expected reset" makes every test here a wire-conformance test of the
 * server. The tail of the suite is the Layer-3 scenario from
 * plans/host-sessions-sync.md: scrollback paging, session switching
 * under streaming load, and a full host reboot with recovery.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
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
import { FakeAcpPort } from "../../src/runtime/sessions/testing/fake-acp-port";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
	predicate: () => boolean,
	label: string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
		}
		await sleep(10);
	}
}

/** app.ts awaits `acpSessions.dispose()` on teardown; the fake needs one. */
class DisposableFakeAcpPort extends FakeAcpPort {
	async dispose(): Promise<void> {}
}

const WORKSPACE_ID = "workspace-parity";

describe("sessions sync client against a real host", () => {
	let host: TestHost;
	let port: DisposableFakeAcpPort;
	let server: ServerType;
	let syncUrl: string;
	let client: SessionsSyncClient;
	const logs: SessionsSyncLogEvent[] = [];
	const extraClients: SessionsSyncClient[] = [];

	let sessionA: Session;
	let mainThreadA: Thread;
	let sessionB: Session;

	function makeClient(instanceId: string): SessionsSyncClient {
		return createSessionsSyncClient({
			clientInstanceId: instanceId,
			clientVersion: "0.0.0-test",
			// A function so the host-reboot scenario can repoint the client at
			// the new server between reconnect attempts, like a relay would.
			syncUrl: () => syncUrl,
			api: {
				list: () => host.trpc.sessions.list.query(),
				get: (input) => host.trpc.sessions.get.query(input),
				getEvents: (input) => host.trpc.sessions.getEvents.query(input),
				resolveToolCall: async (input) => {
					await host.trpc.sessions.resolveToolCall.mutate(input);
				},
			},
			logger: { log: (event) => logs.push(event) },
			reconnectDelayMs: 10,
		});
	}

	async function bootServer(): Promise<void> {
		host = await createTestHost({ acpSessions: port });
		server = await new Promise<ServerType>((resolve) => {
			const instance = serve({ fetch: host.app.fetch, port: 0 }, () =>
				resolve(instance),
			);
		});
		host.injectWebSocket(server);
		const { port: httpPort } = server.address() as AddressInfo;
		syncUrl = `ws://127.0.0.1:${httpPort}${SESSIONS_SYNC_PATH}?token=${host.psk}`;
	}

	beforeAll(async () => {
		port = new DisposableFakeAcpPort();
		await bootServer();
		client = makeClient("client-parity-1");
	});

	afterAll(async () => {
		for (const extra of extraClients) extra.disconnect();
		client?.disconnect();
		await host?.dispose();
		// Not awaited: Bun's node:http shim never fires the close callback,
		// even after every TCP connection is gone (they all close within
		// ~10ms of the clients disconnecting).
		server?.close();
	});

	/** The client's ordered event list for one session. */
	function clientEvents(
		target: SessionsSyncClient,
		sessionId: string,
	): SessionEvent[] {
		const stream = target.store.getState().streamsBySessionId[sessionId];
		if (!stream) throw new Error(`no client stream for ${sessionId}`);
		return stream.eventIds.map((id) => {
			const event = stream.eventsById[id];
			if (!event) throw new Error(`client stream lost event ${id}`);
			return event;
		});
	}

	const byId = <T extends { id: string }>(items: T[]) =>
		[...items].sort((left, right) => left.id.localeCompare(right.id));

	/** The host's full log for one session, stitched backwards through paging. */
	async function hostFullLog(sessionId: string): Promise<SessionEvent[]> {
		const pages: SessionEvent[][] = [];
		let beforeCursor: string | undefined;
		for (;;) {
			const window = await host.trpc.sessions.getEvents.query({
				sessionId,
				...(beforeCursor === undefined ? {} : { beforeCursor }),
				limit: 100,
			});
			pages.unshift(window.items);
			if (!window.range.hasMoreBefore) {
				expect(window.range.truncatedBefore).toBe(false);
				break;
			}
			const oldest = window.range.oldest;
			if (!oldest) throw new Error("hasMoreBefore without an oldest boundary");
			beforeCursor = oldest.cursor;
		}
		return pages.flat();
	}

	/**
	 * The parity oracle: the client's folded store must deep-equal the host's
	 * own answers over tRPC — the client window tiles the exact tail of the
	 * host log, the entity matches, and pending permissions agree.
	 */
	async function expectSessionParity(
		target: SessionsSyncClient,
		sessionId: string,
	): Promise<void> {
		const log = await hostFullLog(sessionId);
		const window = clientEvents(target, sessionId);
		expect(window).toEqual(log.slice(log.length - window.length));
		const stream = target.store.getState().streamsBySessionId[sessionId];
		expect(stream?.latestCursor).toBe(
			log[log.length - 1]?.cursor ?? stream?.latestCursor ?? null,
		);

		const snapshot = await host.trpc.sessions.get.query({ sessionId });
		const state = target.store.getState();
		expect(state.sessionsById[sessionId]).toEqual(snapshot.session);
		const clientPendings = Object.values(state.pendingPermissionsById).filter(
			(pending) => pending.sessionId === sessionId,
		);
		expect(byId(clientPendings)).toEqual(byId(snapshot.pendingPermissions));
	}

	/**
	 * Post-reboot parity: the rebuilt log is event-for-event identical EXCEPT
	 * causationId. Request attribution lives in the serving process (translator
	 * arming at mutation time), not in the adapter journal, so a rebuild
	 * cannot recover it — a documented limitation the durable canonical store
	 * (#10) removes by persisting events instead of re-deriving them.
	 */
	async function expectSessionParityIgnoringCausation(
		target: SessionsSyncClient,
		sessionId: string,
	): Promise<void> {
		const strip = (event: SessionEvent) => ({ ...event, causationId: null });
		const log = await hostFullLog(sessionId);
		const window = clientEvents(target, sessionId);
		expect(window.map(strip)).toEqual(
			log.slice(log.length - window.length).map(strip),
		);
		const snapshot = await host.trpc.sessions.get.query({ sessionId });
		expect(target.store.getState().sessionsById[sessionId]).toEqual(
			snapshot.session,
		);
	}

	/** `sessions.list` IS the host snapshot; the client mirrors it exactly. */
	async function expectListParity(target: SessionsSyncClient): Promise<void> {
		const snapshot = await host.trpc.sessions.list.query();
		const state = target.store.getState();
		expect(byId(Object.values(state.sessionsById))).toEqual(
			byId(snapshot.sessions),
		);
	}

	test("connects, goes live on the host stream, and folds created sessions", async () => {
		client.connect();
		await waitFor(
			() => client.store.getState().connection.status === "connected",
			"the sync socket to connect",
		);
		await waitFor(
			() => client.store.getState().hostSubscription.status === "live",
			"the host stream to go live",
		);
		expect(client.store.getState().connection.hostId).toBe(
			"00000000-0000-0000-0000-000000000001",
		);

		const createdA = await host.trpc.sessions.create.mutate({
			requestId: "req-create-a",
			workspaceId: WORKSPACE_ID,
			agentId: "claude-code",
			title: "Parity A",
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
		});
		sessionA = createdA.session;
		mainThreadA = createdA.mainThread;
		const createdB = await host.trpc.sessions.create.mutate({
			requestId: "req-create-b",
			workspaceId: WORKSPACE_ID,
			agentId: "claude-code",
			title: "Parity B",
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
		});
		sessionB = createdB.session;

		await waitFor(() => {
			const { sessionsById } = client.store.getState();
			return sessionA.id in sessionsById && sessionB.id in sessionsById;
		}, "both created sessions to reach the client via the host stream");
		await expectListParity(client);
	});

	test("a retained session seeds from the tRPC snapshot and folds live chunks", async () => {
		client.retainSession(sessionA.id, "focused");
		await waitFor(
			() =>
				client.store.getState().streamsBySessionId[sessionA.id]?.status ===
				"live",
			"session A to go live",
		);
		await expectSessionParity(client, sessionA.id);

		for (const text of ["alpha ", "beta ", "gamma"]) {
			port.emitUpdate(sessionA.id, {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text },
			});
		}
		await waitFor(
			() =>
				clientEvents(client, sessionA.id).some(
					(event) =>
						event.payload.type === "messageDelta" &&
						event.payload.content.type === "text" &&
						event.payload.content.text === "gamma",
				),
			"the streamed chunks to reach the client store",
		);
		await expectSessionParity(client, sessionA.id);
	});

	test("submitTurn is admitted over tRPC and completion arrives as events", async () => {
		const receipt = await host.trpc.sessions.submitTurn.mutate({
			requestId: "req-turn-1",
			sessionId: sessionA.id,
			threadId: mainThreadA.id,
			content: [{ type: "text", text: "hello gym" }],
		});
		expect(receipt.status).toBe("accepted");

		port.completeTurn(sessionA.id, "end_turn");
		await waitFor(
			() =>
				clientEvents(client, sessionA.id).some(
					(event) =>
						event.payload.type === "turnCompleted" &&
						event.payload.turnId === receipt.turnId &&
						event.payload.stopReason === "endTurn",
				),
			"the turn to complete in the client store",
		);

		const events = clientEvents(client, sessionA.id);
		const started = events.find(
			(event) =>
				event.payload.type === "turnStarted" &&
				event.payload.turn.id === receipt.turnId,
		);
		if (!started) throw new Error("turnStarted never reached the client");
		// The receipt's requestId is the causation chain into the event log.
		expect(started.causationId).toBe("req-turn-1");
		expect(client.store.getState().sessionsById[sessionA.id]?.runState).toBe(
			"idle",
		);
		await expectSessionParity(client, sessionA.id);
	});

	test("a permission card folds in and resolves through tRPC", async () => {
		port.requestPermission(sessionA.id, "perm-native-1", "toolu-1");
		await waitFor(
			() =>
				Object.values(client.store.getState().pendingPermissionsById).some(
					(pending) => pending.sessionId === sessionA.id,
				),
			"the permission card to reach the client store",
		);
		await expectSessionParity(client, sessionA.id);

		const pending = Object.values(
			client.store.getState().pendingPermissionsById,
		).find((entry) => entry.sessionId === sessionA.id);
		if (!pending) throw new Error("pending permission disappeared");
		expect(pending.toolCallId).toBe("toolu-1");
		const allow = pending.options.find((option) => option.kind === "allowOnce");
		if (!allow) throw new Error("no allowOnce option on the card");

		const receipt = await host.trpc.sessions.resolvePermission.mutate({
			requestId: "req-perm-1",
			sessionId: sessionA.id,
			permissionId: pending.id,
			outcome: { type: "selected", optionIds: [allow.id] },
		});
		expect(receipt.status).toBe("accepted");
		await waitFor(
			() =>
				!Object.values(client.store.getState().pendingPermissionsById).some(
					(entry) => entry.sessionId === sessionA.id,
				),
			"the permission card to drain from the client store",
		);
		// The decision reached the adapter, not just the projection.
		expect(port.respondCalls.at(-1)).toEqual({
			requestId: "perm-native-1",
			outcome: { outcome: "selected", optionId: allow.id },
		});
		await expectSessionParity(client, sessionA.id);
	});

	test("offline activity replays gaplessly across a reconnect", async () => {
		client.disconnect();
		await waitFor(
			() => client.store.getState().connection.status === "disconnected",
			"the client to disconnect",
		);

		// While the socket is down the host keeps moving — and tRPC keeps
		// working; the WS is a read path, never a write dependency.
		port.emitUpdate(sessionA.id, {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "offline delta" },
		});
		port.requestPermission(sessionA.id, "perm-native-2", "toolu-2");
		const snapshot = await host.trpc.sessions.get.query({
			sessionId: sessionA.id,
		});
		const offlinePending = snapshot.pendingPermissions.find(
			(pending) => pending.toolCallId === "toolu-2",
		);
		if (!offlinePending) throw new Error("offline permission not pending");
		await host.trpc.sessions.resolvePermission.mutate({
			requestId: "req-perm-2",
			sessionId: sessionA.id,
			permissionId: offlinePending.id,
			outcome: { type: "cancelled" },
		});

		client.connect();
		await waitFor(
			() =>
				client.store.getState().streamsBySessionId[sessionA.id]?.status ===
				"live",
			"session A to resume live after reconnect",
		);
		await waitFor(
			() => client.store.getState().hostSubscription.status === "live",
			"the host stream to resume live after reconnect",
		);
		await expectSessionParity(client, sessionA.id);
		await expectListParity(client);

		// The replay tiled exactly: no event id appears twice in the fold.
		const ids = clientEvents(client, sessionA.id).map((event) => event.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("a fresh client converges to the same state", async () => {
		const second = makeClient("client-parity-2");
		extraClients.push(second);
		second.connect();
		second.retainSession(sessionA.id, "focused");
		await waitFor(
			() =>
				second.store.getState().streamsBySessionId[sessionA.id]?.status ===
				"live",
			"the second client to go live on session A",
		);
		await expectSessionParity(second, sessionA.id);
		await expectListParity(second);
		expect(second.store.getState().sessionsById).toEqual(
			client.store.getState().sessionsById,
		);
		second.disconnect();
	});

	test("archiving removes the session from the list and the client store", async () => {
		const receipt = await host.trpc.sessions.update.mutate({
			requestId: "req-archive-b",
			sessionId: sessionB.id,
			archived: true,
		});
		expect(receipt.status).toBe("accepted");
		await waitFor(
			() => !(sessionB.id in client.store.getState().sessionsById),
			"the archived session to leave the client store",
		);
		// list (the host snapshot) excludes archived rows; the registry row
		// still exists and `get` still serves it.
		const listed = await host.trpc.sessions.list.query();
		expect(listed.sessions.some((item) => item.id === sessionB.id)).toBe(false);
		const archived = await host.trpc.sessions.get.query({
			sessionId: sessionB.id,
		});
		expect(archived.session.archivedAt).toBeGreaterThan(0);
		await expectListParity(client);
		expect(sessionA.id in client.store.getState().sessionsById).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Layer-3 realistic scenario (plans/host-sessions-sync.md)
	// -------------------------------------------------------------------------

	test("scrollback: backwards paging stitches the client window onto the full host log", async () => {
		// Push well past the snapshot tail (50) so the seed is a strict suffix.
		for (let index = 0; index < 80; index += 1) {
			port.emitUpdate(sessionA.id, {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: `bulk-${index} ` },
			});
		}
		await waitFor(
			() =>
				clientEvents(client, sessionA.id).some(
					(event) =>
						event.payload.type === "messageDelta" &&
						event.payload.content.type === "text" &&
						event.payload.content.text === "bulk-79 ",
				),
			"the bulk chunks to reach the client store",
		);

		// A third client seeds fresh: its window is the snapshot tail only,
		// with hasOlder signalling scrollback exists.
		const pager = makeClient("client-parity-pager");
		extraClients.push(pager);
		pager.connect();
		pager.retainSession(sessionA.id, "focused");
		await waitFor(
			() =>
				pager.store.getState().streamsBySessionId[sessionA.id]?.status ===
				"live",
			"the paging client to go live on session A",
		);
		const seeded = pager.store.getState().streamsBySessionId[sessionA.id];
		if (!seeded) throw new Error("paging client has no stream");
		expect(seeded.hasOlder).toBe(true);
		const fullLog = await hostFullLog(sessionA.id);
		expect(seeded.eventIds.length).toBeLessThan(fullLog.length);

		// Drag up until the log is exhausted; the fold must equal the host's
		// full log exactly — order, cursors, and all.
		for (let guard = 0; guard < 20; guard += 1) {
			const stream = pager.store.getState().streamsBySessionId[sessionA.id];
			if (!stream?.hasOlder) break;
			await pager.fetchOlderEvents(sessionA.id, { limit: 40 });
		}
		expect(clientEvents(pager, sessionA.id)).toEqual(fullLog);
		expect(
			pager.store.getState().streamsBySessionId[sessionA.id]?.hasOlder,
		).toBe(false);
		pager.disconnect();
	});

	test("session switching under load keeps both streams consistent", async () => {
		// The phone taps into B while A keeps streaming in the background.
		const releaseB = client.retainSession(sessionB.id, "focused");
		// B was archived earlier; un-archive so it is back in scope.
		await host.trpc.sessions.update.mutate({
			requestId: "req-unarchive-b",
			sessionId: sessionB.id,
			archived: false,
		});
		for (let index = 0; index < 10; index += 1) {
			port.emitUpdate(sessionA.id, {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: `switch-a-${index} ` },
			});
			port.emitUpdate(sessionB.id, {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: `switch-b-${index} ` },
			});
		}
		await waitFor(
			() =>
				client.store.getState().streamsBySessionId[sessionB.id]?.status ===
					"live" &&
				clientEvents(client, sessionB.id).some(
					(event) =>
						event.payload.type === "messageDelta" &&
						event.payload.content.type === "text" &&
						event.payload.content.text === "switch-b-9 ",
				),
			"session B to go live and stream while A is retained",
		);
		await waitFor(
			() =>
				clientEvents(client, sessionA.id).some(
					(event) =>
						event.payload.type === "messageDelta" &&
						event.payload.content.type === "text" &&
						event.payload.content.text === "switch-a-9 ",
				),
			"session A to keep streaming during the switch",
		);
		await expectSessionParity(client, sessionA.id);
		await expectSessionParity(client, sessionB.id);
		releaseB();
	});

	test("host reboot: registry survives, host stream resets, sessions recover", async () => {
		const eventsBefore = clientEvents(client, sessionA.id);
		expect(eventsBefore.length).toBeGreaterThan(0);
		const hostCursorBefore =
			client.store.getState().hostSubscription.latestCursor;
		expect(hostCursorBefore).not.toBeNull();

		// Kill the host process (dispose the app + server) and boot a fresh
		// one over the SAME session state — a new hub incarnation.
		const oldHost = host;
		const oldServer = server;
		client.disconnect();
		// Disconnect downgraded every stream: "live" must always mean "caught
		// up on an open socket", or recovery waits pass on stale state.
		expect(client.store.getState().hostSubscription.status).toBe("idle");
		expect(
			client.store.getState().streamsBySessionId[sessionA.id]?.status,
		).toBe("idle");
		await oldHost.dispose();
		oldServer.close();
		await bootServer();

		// The client reconnects: its host cursor belongs to the dead boot →
		// reset → tRPC list refetch; its session cursor still resolves because
		// the deterministic fake journal rebuilds the identical canonical log.
		client.connect();
		await waitFor(
			() =>
				client.store.getState().hostSubscription.status === "live" &&
				client.store.getState().hostSubscription.latestCursor !==
					hostCursorBefore,
			"the host stream to recover on the new hub incarnation",
			15_000,
		);
		await waitFor(
			() =>
				client.store.getState().streamsBySessionId[sessionA.id]?.status ===
				"live",
			"session A to recover after the reboot",
		);

		const resets = logs.filter(
			(event) => event.event === "sessions_sync.stream_reset",
		);
		expect(resets).toEqual([
			{
				event: "sessions_sync.stream_reset",
				sessionId: null,
				code: "CURSOR_INVALID",
				recovery: "refetchSnapshot",
			},
		]);

		// Nothing was lost or duplicated across the reboot.
		const ids = clientEvents(client, sessionA.id).map((event) => event.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual(
			expect.arrayContaining(eventsBefore.map((event) => event.id)),
		);
		await expectSessionParityIgnoringCausation(client, sessionA.id);
		await expectListParity(client);
		// The rebuild really did lose attribution — this assertion pins the
		// documented limitation so its eventual fix (#10) must update it.
		const rebuilt = await hostFullLog(sessionA.id);
		expect(rebuilt.every((event) => event.causationId === null)).toBe(true);

		// The host keeps streaming on the new boot.
		port.emitUpdate(sessionA.id, {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "post-reboot" },
		});
		await waitFor(
			() =>
				clientEvents(client, sessionA.id).some(
					(event) =>
						event.payload.type === "messageDelta" &&
						event.payload.content.type === "text" &&
						event.payload.content.text === "post-reboot",
				),
			"post-reboot activity to stream to the client",
		);
		await expectSessionParityIgnoringCausation(client, sessionA.id);
	});

	test("the wire stayed clean: no drops, and only the reboot's one reset", () => {
		const drops = logs.filter(
			(event) => event.event === "sessions_sync.socket_dropped",
		);
		expect(drops).toEqual([]);
		const resets = logs.filter(
			(event) => event.event === "sessions_sync.stream_reset",
		);
		expect(resets).toHaveLength(1);
		expect(client.store.getState().connection.error).toBeNull();
	});
});
