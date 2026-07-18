import { describe, expect, test } from "bun:test";
import type {
	HostEventPacket,
	SessionEventPacket,
	SyncServerPacket,
} from "@superset/host-service-sync/protocol";
import { CanonicalSessionsError } from "./canonical-sessions";
import type { SessionsSyncConnection } from "./sync-hub";
import {
	chunk,
	eventPackets,
	expectPacket,
	type FakeSyncSocket,
	flush,
	makeHub,
	openClient,
	seedLive,
	subscribeFrame,
	unsubscribeFrame,
	ZERO_HOST_CURSOR,
	ZERO_SESSION_CURSOR,
} from "./testing/sync-harness";
import { acpMainThreadId } from "./translate-acp";

// ---------------------------------------------------------------------------
// Deterministic randomness — mulberry32, so a failing seed replays exactly.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

class Rng {
	private readonly next: () => number;
	constructor(seed: number) {
		this.next = mulberry32(seed);
	}
	float(): number {
		return this.next();
	}
	pick<T>(items: readonly T[]): T {
		const item = items[Math.floor(this.next() * items.length)];
		if (item === undefined) throw new Error("pick from an empty list");
		return item;
	}
	chance(probability: number): boolean {
		return this.next() < probability;
	}
}

function hostSerialOf(cursor: string): number {
	const match = /^h[a-z0-9]+-(\d{12})$/.exec(cursor);
	if (!match) throw new Error(`not a host cursor: ${cursor}`);
	return Number(match[1]);
}

// ---------------------------------------------------------------------------
// Subscription oracle
// ---------------------------------------------------------------------------

type TrackerPhase = "awaiting_subscribed" | "replaying" | "live" | "done";

/**
 * Client-side oracle for one subscription. Enforces the packet grammar
 * (subscribed → replay → caughtUp → live → unsubscribed), strict cursor
 * monotonicity, host-serial contiguity, and folds host events so the
 * end-of-run check can compare against the runtime's truth.
 */
class SubscriptionTracker {
	phase: TrackerPhase = "awaiting_subscribed";
	/** Every event cursor delivered — replay and live — in arrival order. */
	readonly cursors: string[] = [];
	through: string | null = null;
	lastDelivered: string | null = null;
	/** Host-stream folds; non-null only for zero-cursor host subscriptions. */
	membership: Set<string> | null = null;
	pendingPermissions: Set<string> | null = null;

	constructor(
		readonly subscriptionId: string,
		readonly stream: "host" | "session",
		readonly sessionId: string | null,
		readonly after: string,
	) {
		// A zero-cursor host subscribe replays the whole ring, so folding from
		// empty sets reconstructs the host scope; a mid-stream resume cannot.
		if (stream === "host" && after === ZERO_HOST_CURSOR) {
			this.membership = new Set();
			this.pendingPermissions = new Set();
		}
	}

	private get tag(): string {
		const scope = this.sessionId ? `:${this.sessionId}` : "";
		return `${this.subscriptionId} (${this.stream}${scope}, after=${this.after})`;
	}

	feed(packet: SyncServerPacket): void {
		switch (this.phase) {
			case "awaiting_subscribed": {
				if (packet.type !== "subscribed") {
					throw new Error(
						`${this.tag}: expected subscribed, got ${packet.type}`,
					);
				}
				if (
					packet.stream !== this.stream ||
					(packet.sessionId ?? null) !== this.sessionId
				) {
					throw new Error(`${this.tag}: subscribed for the wrong stream`);
				}
				if (packet.replay.fromExclusive !== this.after) {
					throw new Error(
						`${this.tag}: fromExclusive ${packet.replay.fromExclusive} != requested after`,
					);
				}
				this.through = packet.replay.through;
				this.lastDelivered = packet.replay.through;
				this.phase = "replaying";
				return;
			}
			case "replaying": {
				if (packet.type === "event") {
					this.acceptEvent(packet, { live: false });
					return;
				}
				if (packet.type === "caughtUp") {
					if (packet.through !== this.through) {
						throw new Error(
							`${this.tag}: caughtUp through ${packet.through} != ${this.through}`,
						);
					}
					this.phase = "live";
					return;
				}
				throw new Error(`${this.tag}: unexpected ${packet.type} during replay`);
			}
			case "live": {
				if (packet.type === "event") {
					this.acceptEvent(packet, { live: true });
					return;
				}
				if (packet.type === "unsubscribed") {
					if (
						packet.stream !== this.stream ||
						(packet.sessionId ?? null) !== this.sessionId
					) {
						throw new Error(`${this.tag}: unsubscribed for the wrong stream`);
					}
					if (packet.through !== this.lastDelivered) {
						throw new Error(
							`${this.tag}: unsubscribed through ${packet.through} != last delivered ${this.lastDelivered}`,
						);
					}
					this.phase = "done";
					return;
				}
				throw new Error(`${this.tag}: unexpected ${packet.type} while live`);
			}
			case "done":
				throw new Error(`${this.tag}: ${packet.type} after unsubscribed`);
		}
	}

	private acceptEvent(
		packet: HostEventPacket | SessionEventPacket,
		{ live }: { live: boolean },
	): void {
		if (packet.stream !== this.stream) {
			throw new Error(`${this.tag}: event for the wrong stream`);
		}
		if (this.through === null) {
			throw new Error(`${this.tag}: event before subscribed`);
		}
		const floor = this.cursors[this.cursors.length - 1] ?? this.after;
		if (packet.cursor <= floor) {
			throw new Error(
				`${this.tag}: cursor ${packet.cursor} <= ${floor} (duplicate or regression)`,
			);
		}
		if (live) {
			if (packet.cursor <= this.through) {
				throw new Error(
					`${this.tag}: live cursor ${packet.cursor} inside the replay window`,
				);
			}
		} else if (packet.cursor > this.through) {
			throw new Error(
				`${this.tag}: replay cursor ${packet.cursor} beyond through ${this.through}`,
			);
		}
		if (packet.stream === "session") {
			if (packet.sessionId !== this.sessionId) {
				throw new Error(`${this.tag}: event for session ${packet.sessionId}`);
			}
			if (packet.event.cursor !== packet.cursor) {
				throw new Error(`${this.tag}: packet cursor != event cursor`);
			}
		} else {
			// Host serials are minted one per change and every registered
			// subscription hears every change, so the stream must be contiguous.
			const expectedSerial = hostSerialOf(floor) + 1;
			if (hostSerialOf(packet.cursor) !== expectedSerial) {
				throw new Error(
					`${this.tag}: host serial gap — got ${packet.cursor}, expected serial ${expectedSerial}`,
				);
			}
			const event = packet.event;
			if (this.membership) {
				if (event.type === "sessionUpsert") {
					this.membership.add(packet.sessionId);
				} else if (event.type === "sessionRemoved") {
					this.membership.delete(packet.sessionId);
				}
			}
			if (this.pendingPermissions) {
				if (event.type === "permissionAvailable") {
					this.pendingPermissions.add(event.permission.id);
				} else if (event.type === "permissionResolved") {
					this.pendingPermissions.delete(event.permissionId);
				}
			}
		}
		this.cursors.push(packet.cursor);
		this.lastDelivered = packet.cursor;
	}
}

// ---------------------------------------------------------------------------
// Churn model
// ---------------------------------------------------------------------------

interface ClientState {
	name: string;
	socket: FakeSyncSocket;
	connection: SessionsSyncConnection;
	/** Every tracker ever created, including unsubscribed and dead ones. */
	trackers: Map<string, SubscriptionTracker>;
	/** Mirror of the hub's registered-subscription set for this connection. */
	active: Set<string>;
	/** Error codes the model deliberately provoked, in send order. */
	expectedErrors: string[];
	alive: boolean;
	subscriptionSerial: number;
}

const SESSIONS = ["session-a", "session-b", "session-c", "session-d"] as const;
const MAX_SUBSCRIPTIONS = 6;
const MAX_CLIENTS = 5;
const OPS_PER_SEED = 220;
const SEEDS = [11, 23, 37, 41, 59];

async function runChurn(seed: number): Promise<void> {
	const rng = new Rng(seed);
	const { port, runtime, hub } = makeHub({
		limits: { maxSubscriptions: MAX_SUBSCRIPTIONS },
	});
	for (const sessionId of SESSIONS) seedLive(port, sessionId);
	// Track everything up front so permission and turn folds are live from the
	// start; hostSnapshotData's pendings come from tracked sessions only.
	for (const sessionId of SESSIONS) await runtime.warmSession(sessionId);
	await flush();

	const clients: ClientState[] = [];
	let clientSerial = 0;
	let requestSerial = 0;
	let permissionSerial = 0;
	const outstandingPermissions: Array<{
		sessionId: string;
		requestId: string;
	}> = [];
	const archived = new Set<string>();

	const openNewClient = async (): Promise<ClientState> => {
		clientSerial += 1;
		const { socket, client } = await openClient(hub);
		const state: ClientState = {
			name: `client-${clientSerial}`,
			socket,
			connection: client,
			trackers: new Map(),
			active: new Set(),
			expectedErrors: [],
			alive: true,
			subscriptionSerial: 0,
		};
		clients.push(state);
		return state;
	};

	const aliveClients = () => clients.filter((client) => client.alive);

	const route = (client: ClientState, packet: SyncServerPacket): void => {
		switch (packet.type) {
			case "pong":
			case "helloAck":
				throw new Error(`${client.name}: unexpected ${packet.type}`);
			case "error": {
				const expected = client.expectedErrors.shift();
				if (packet.code !== expected) {
					throw new Error(
						`${client.name}: unexpected error ${packet.code} (expected ${expected ?? "no error"})`,
					);
				}
				return;
			}
			case "reset":
				// Every cursor this model resumes from was previously delivered by
				// this hub incarnation and nothing is ever evicted, so a reset is
				// always a hub bug here.
				throw new Error(
					`${client.name}: unexpected reset for ${packet.subscriptionId}`,
				);
			case "subscribed":
			case "caughtUp":
			case "event":
			case "unsubscribed": {
				const tracker = client.trackers.get(packet.subscriptionId);
				if (!tracker) {
					throw new Error(
						`${client.name}: packet for unknown subscription ${packet.subscriptionId}`,
					);
				}
				tracker.feed(packet);
				return;
			}
		}
	};

	const drainAll = (): void => {
		for (const client of clients) {
			const packets = client.socket.take();
			if (!client.alive) {
				if (packets.length > 0) {
					throw new Error(`${client.name}: received packets after going away`);
				}
				continue;
			}
			for (const packet of packets) route(client, packet);
			if (client.expectedErrors.length > 0) {
				throw new Error(
					`${client.name}: expected ${client.expectedErrors.join(", ")} never arrived`,
				);
			}
			if (client.socket.closed) {
				// The only server-initiated close in this run is back-pressure.
				expect(client.socket.closed.code).toBe(1013);
				client.alive = false;
			}
		}
	};

	const settle = async (): Promise<void> => {
		await flush();
		drainAll();
	};

	const rememberedCursor = (
		stream: "host" | "session",
		sessionId: string | null,
	): string | null => {
		// Cursors from dead connections are deliberately included: resuming
		// from a killed client's last delivery is the reconnect story.
		const candidates: string[] = [];
		for (const client of clients) {
			for (const tracker of client.trackers.values()) {
				if (tracker.stream !== stream) continue;
				if (stream === "session" && tracker.sessionId !== sessionId) continue;
				if (tracker.lastDelivered !== null) {
					candidates.push(tracker.lastDelivered);
				}
			}
		}
		return candidates.length > 0 ? rng.pick(candidates) : null;
	};

	const subscribeAction = async (client: ClientState): Promise<void> => {
		client.subscriptionSerial += 1;
		if (client.active.size >= MAX_SUBSCRIPTIONS) {
			// Deliberately overflow: the hub must refuse with a retryable
			// SUBSCRIPTION_LIMIT and register nothing.
			client.expectedErrors.push("SUBSCRIPTION_LIMIT");
			await client.connection.handleMessage(
				subscribeFrame({
					subscriptionId: `${client.name}-overflow-${client.subscriptionSerial}`,
					stream: { type: "host" },
				}),
			);
			return;
		}
		const subscriptionId = `${client.name}-sub-${client.subscriptionSerial}`;
		if (rng.chance(0.6)) {
			const sessionId = rng.pick(SESSIONS);
			// The zero cursor is the "from scratch" idiom: what a client that
			// fetched an empty tRPC snapshot holds.
			const after =
				(rng.chance(0.5) ? rememberedCursor("session", sessionId) : null) ??
				ZERO_SESSION_CURSOR;
			client.trackers.set(
				subscriptionId,
				new SubscriptionTracker(subscriptionId, "session", sessionId, after),
			);
			client.active.add(subscriptionId);
			await client.connection.handleMessage(
				subscribeFrame({
					subscriptionId,
					stream: { type: "session", sessionId },
					after,
				}),
			);
			return;
		}
		const after =
			(rng.chance(0.5) ? rememberedCursor("host", null) : null) ??
			ZERO_HOST_CURSOR;
		client.trackers.set(
			subscriptionId,
			new SubscriptionTracker(subscriptionId, "host", null, after),
		);
		client.active.add(subscriptionId);
		await client.connection.handleMessage(
			subscribeFrame({ subscriptionId, stream: { type: "host" }, after }),
		);
	};

	await openNewClient();
	await openNewClient();
	await settle();

	for (let op = 0; op < OPS_PER_SEED; op += 1) {
		if (aliveClients().length === 0) await openNewClient();
		const roll = rng.float();
		if (roll < 0.24) {
			port.emitUpdate(rng.pick(SESSIONS), chunk(`churn ${seed}:${op}`));
		} else if (roll < 0.32) {
			port.emitState(rng.pick(SESSIONS), {});
		} else if (roll < 0.38) {
			const candidates = SESSIONS.filter((id) => !archived.has(id));
			if (candidates.length > 0) {
				const sessionId = rng.pick(candidates);
				requestSerial += 1;
				try {
					await runtime.submitTurn({
						requestId: `req-turn-${seed}-${requestSerial}`,
						sessionId,
						threadId: acpMainThreadId(sessionId),
						content: [{ type: "text", text: `turn ${op}` }],
					});
				} catch (error) {
					// Busy/receipt conflicts are turn-lifecycle concerns, not what
					// this suite measures; anything else is a real failure.
					if (!(error instanceof CanonicalSessionsError)) throw error;
				}
			}
		} else if (roll < 0.44) {
			// Permissions only on in-scope sessions: their host events are not
			// scope-filtered, which would desync the pendings fold below.
			const candidates = SESSIONS.filter((id) => !archived.has(id));
			if (candidates.length > 0) {
				const sessionId = rng.pick(candidates);
				permissionSerial += 1;
				const requestId = `perm-${seed}-${permissionSerial}`;
				port.requestPermission(
					sessionId,
					requestId,
					`toolu-${permissionSerial}`,
				);
				outstandingPermissions.push({ sessionId, requestId });
			}
		} else if (roll < 0.5) {
			if (outstandingPermissions.length > 0) {
				const index = Math.floor(rng.float() * outstandingPermissions.length);
				const [pending] = outstandingPermissions.splice(index, 1);
				if (pending) {
					port.respondToPermission({
						sessionId: pending.sessionId,
						requestId: pending.requestId,
						outcome: { outcome: "selected", optionId: "allow" },
					});
				}
			}
		} else if (roll < 0.55) {
			const candidates = SESSIONS.filter(
				(id) =>
					!archived.has(id) &&
					!outstandingPermissions.some((pending) => pending.sessionId === id),
			);
			if (candidates.length > 0) {
				const sessionId = rng.pick(candidates);
				requestSerial += 1;
				await runtime.updateSession({
					requestId: `req-archive-${seed}-${requestSerial}`,
					sessionId,
					archived: true,
				});
				archived.add(sessionId);
			}
		} else if (roll < 0.59) {
			const candidates = SESSIONS.filter((id) => archived.has(id));
			if (candidates.length > 0) {
				const sessionId = rng.pick(candidates);
				requestSerial += 1;
				await runtime.updateSession({
					requestId: `req-restore-${seed}-${requestSerial}`,
					sessionId,
					archived: false,
				});
				archived.delete(sessionId);
			}
		} else if (roll < 0.72) {
			await subscribeAction(rng.pick(aliveClients()));
		} else if (roll < 0.79) {
			const withSubs = aliveClients().filter(
				(client) => client.active.size > 0,
			);
			if (withSubs.length > 0) {
				const client = rng.pick(withSubs);
				const subscriptionId = rng.pick([...client.active]);
				client.active.delete(subscriptionId);
				requestSerial += 1;
				await client.connection.handleMessage(
					unsubscribeFrame(
						subscriptionId,
						`req-unsub-${seed}-${requestSerial}`,
					),
				);
			}
		} else if (roll < 0.83) {
			if (clients.length < MAX_CLIENTS) await openNewClient();
		} else if (roll < 0.86) {
			const candidates = aliveClients();
			if (candidates.length > 1) {
				const client = rng.pick(candidates);
				client.connection.dispose();
				client.alive = false;
			}
		} else if (roll < 0.9) {
			const client = rng.pick(aliveClients());
			client.expectedErrors.push("INVALID_PACKET");
			await client.connection.handleMessage("{ this is not json");
		} else if (roll < 0.93) {
			const withSubs = aliveClients().filter(
				(client) => client.active.size > 0,
			);
			if (withSubs.length > 0) {
				const client = rng.pick(withSubs);
				client.expectedErrors.push("INVALID_PACKET");
				await client.connection.handleMessage(
					subscribeFrame({
						subscriptionId: rng.pick([...client.active]),
						stream: { type: "host" },
					}),
				);
			}
		} else if (roll < 0.96) {
			const client = rng.pick(aliveClients());
			client.expectedErrors.push("INVALID_PACKET");
			requestSerial += 1;
			await client.connection.handleMessage(
				unsubscribeFrame(
					`ghost-${seed}-${requestSerial}`,
					`req-ghost-${requestSerial}`,
				),
			);
		} else {
			// Back-pressure kill: the next send drops the connection with 1013.
			const candidates = aliveClients();
			if (candidates.length > 1) {
				const client = rng.pick(candidates);
				client.socket.bufferedAmount = 9 * 1024 * 1024;
				await client.connection.handleMessage(
					JSON.stringify({ type: "ping", nonce: "doom" }),
				);
			}
		}
		await settle();
	}
	await settle();

	// ---- Oracle: every session subscription saw an exact canonical suffix ----
	const canonicalCache = new Map<string, string[]>();
	const canonicalFor = (sessionId: string): string[] => {
		let cursors = canonicalCache.get(sessionId);
		if (!cursors) {
			const replay = runtime.sessionReplay(sessionId, null);
			if (!replay.ok) throw new Error(`no canonical replay for ${sessionId}`);
			cursors = replay.events.map((event) => event.cursor);
			canonicalCache.set(sessionId, cursors);
		}
		return cursors;
	};

	let checkedSessionTrackers = 0;
	for (const client of clients) {
		for (const tracker of client.trackers.values()) {
			if (tracker.phase === "awaiting_subscribed") {
				throw new Error(`${tracker.subscriptionId} never got subscribed`);
			}
			if (tracker.stream !== "session" || tracker.sessionId === null) continue;
			const expected = canonicalFor(tracker.sessionId).filter(
				(cursor) => cursor > tracker.after,
			);
			// Dead and unsubscribed trackers hold a prefix; a live tracker on a
			// live connection must have received everything.
			expect(tracker.cursors).toEqual(
				expected.slice(0, tracker.cursors.length),
			);
			if (client.alive && tracker.phase === "live") {
				expect(tracker.cursors.length).toBe(expected.length);
			}
			checkedSessionTrackers += 1;
		}
	}
	expect(checkedSessionTrackers).toBeGreaterThan(0);

	// ---- Oracle: host subscriptions converge on the runtime's truth ----
	const liveHostTrackers: SubscriptionTracker[] = [];
	for (const client of aliveClients()) {
		for (const tracker of client.trackers.values()) {
			if (tracker.stream === "host" && tracker.phase === "live") {
				liveHostTrackers.push(tracker);
			}
		}
	}
	if (liveHostTrackers.length > 0) {
		const finalSerials = new Set(
			liveHostTrackers.map((tracker) =>
				hostSerialOf(tracker.lastDelivered ?? ""),
			),
		);
		expect(finalSerials.size).toBe(1);

		const data = runtime.hostSnapshotData();
		const scopeIds = data.sessions.map((session) => session.id).sort();
		expect(scopeIds).toEqual(SESSIONS.filter((id) => !archived.has(id)).sort());
		const pendingIds = data.pendingPermissions
			.map((permission) => permission.id)
			.sort();
		expect(pendingIds.length).toBe(outstandingPermissions.length);
		for (const tracker of liveHostTrackers) {
			if (tracker.membership) {
				expect([...tracker.membership].sort()).toEqual(scopeIds);
			}
			if (tracker.pendingPermissions) {
				expect([...tracker.pendingPermissions].sort()).toEqual(pendingIds);
			}
		}
	}

	// ---- Shutdown: survivors close 1001, feeds detach ----
	const survivors = aliveClients();
	expect(survivors.length).toBeGreaterThan(0);
	hub.dispose();
	for (const client of survivors) {
		expect(client.socket.closed?.code).toBe(1001);
	}
	port.emitUpdate("session-a", chunk("after dispose"));
	await flush();
	for (const client of clients) {
		expect(client.socket.take()).toHaveLength(0);
	}
}

describe("sessions sync stress", () => {
	for (const seed of SEEDS) {
		test(`randomized churn (seed ${seed}): every subscription sees a gapless canonical suffix`, async () => {
			await runChurn(seed);
		});
	}

	test("a connection killed mid-subscribe never registers and leaves others untouched", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const healthy = await openClient(hub);
		await healthy.client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-healthy",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		healthy.socket.take();

		const doomed = await openClient(hub);
		doomed.socket.bufferedAmount = 9 * 1024 * 1024;
		await doomed.client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-doomed",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		// The very first send (subscribed) hits back-pressure: nothing was
		// delivered, nothing registered, and the socket closed 1013.
		expect(doomed.socket.take()).toHaveLength(0);
		expect(doomed.socket.closed?.code).toBe(1013);

		port.emitUpdate("session-a", chunk("still flowing"));
		expect(eventPackets(healthy.socket.take()).length).toBeGreaterThan(0);
		expect(doomed.socket.take()).toHaveLength(0);
	});

	test("kill and resume: a reconnect from the last delivered cursor closes the gap exactly", async () => {
		const { port, runtime, hub } = makeHub();
		seedLive(port, "session-a");

		const first = await openClient(hub);
		await first.client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-first",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		const setup = first.socket.take();
		const through = expectPacket(setup[0], "subscribed").replay.through;

		port.emitUpdate("session-a", chunk("one"));
		port.emitUpdate("session-a", chunk("two"));
		const beforeKill = eventPackets(first.socket.take()).map(
			(packet) => packet.cursor,
		);
		const lastDelivered = beforeKill[beforeKill.length - 1];
		if (!lastDelivered) throw new Error("expected deliveries before the kill");

		// The client stops draining and dies mid-stream…
		first.socket.bufferedAmount = 9 * 1024 * 1024;
		port.emitUpdate("session-a", chunk("lost in flight"));
		expect(first.socket.closed?.code).toBe(1013);
		// …while the world keeps moving.
		port.emitUpdate("session-a", chunk("while offline"));

		const second = await openClient(hub);
		await second.client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-second",
				stream: { type: "session", sessionId: "session-a" },
				after: lastDelivered,
			}),
		);
		const packets = second.socket.take();
		const resumed = expectPacket(packets[0], "subscribed");
		expect(resumed.replay.fromExclusive).toBe(lastDelivered);
		const replayed = eventPackets(packets).map((packet) => packet.cursor);
		expect(expectPacket(packets[packets.length - 1], "caughtUp").through).toBe(
			resumed.replay.through,
		);

		// The two delivery windows tile the canonical log exactly: no gap at
		// the kill, no duplicates across the reconnect.
		const canonical = runtime.sessionReplay("session-a", null);
		if (!canonical.ok) throw new Error("expected canonical replay");
		const expected = canonical.events
			.map((event) => event.cursor)
			.filter((cursor) => cursor > through);
		expect([...beforeKill, ...replayed]).toEqual(expected);

		// And the resumed subscription is live.
		port.emitUpdate("session-a", chunk("back online"));
		const live = eventPackets(second.socket.take());
		expect(live.length).toBeGreaterThan(0);
		for (const packet of live) {
			expect(packet.cursor > resumed.replay.through).toBe(true);
		}
	});

	test("subscribe/unsubscribe churn on one id stays grammar-clean and monotonic", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);

		let previousThrough: string | null = null;
		for (let round = 0; round < 30; round += 1) {
			// Every round re-subscribes from scratch: the zero cursor replays the
			// whole (growing) log, ending exactly at the advertised through.
			await client.handleMessage(
				subscribeFrame({
					subscriptionId: "sub-churn",
					stream: { type: "session", sessionId: "session-a" },
					requestId: `req-sub-${round}`,
				}),
			);
			const setup = socket.take();
			const subscribed = expectPacket(setup[0], "subscribed");
			const through = subscribed.replay.through;
			const replayed = eventPackets(setup);
			expect(setup).toHaveLength(replayed.length + 2);
			expect(replayed[replayed.length - 1]?.cursor).toBe(through);
			expect(expectPacket(setup[setup.length - 1], "caughtUp").through).toBe(
				through,
			);
			if (previousThrough !== null) {
				// Events emitted between rounds land in the next replay window.
				expect(through > previousThrough).toBe(true);
			}

			port.emitUpdate("session-a", chunk(`round ${round}`));
			const live = eventPackets(socket.take());
			expect(live.length).toBeGreaterThan(0);
			const lastCursor = live[live.length - 1]?.cursor ?? "";

			await client.handleMessage(
				unsubscribeFrame("sub-churn", `req-unsub-${round}`),
			);
			const unsubscribed = expectPacket(socket.take()[0], "unsubscribed");
			expect(unsubscribed.through).toBe(lastCursor);

			port.emitUpdate("session-a", chunk(`between rounds ${round}`));
			expect(socket.take()).toHaveLength(0);
			previousThrough = through;
		}
	});

	test("garbage frames interleaved with live traffic do not disturb the stream", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-a",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		socket.take();

		port.emitUpdate("session-a", chunk("first"));
		await client.handleMessage("not json at all");
		port.emitUpdate("session-a", chunk("second"));

		const packets = socket.take();
		const error = expectPacket(
			packets.find((packet) => packet.type === "error"),
			"error",
		);
		expect(error.code).toBe("INVALID_PACKET");
		const cursors = eventPackets(packets).map((packet) => packet.cursor);
		expect(cursors.length).toBeGreaterThanOrEqual(2);
		expect([...cursors].sort()).toEqual(cursors);
		expect(new Set(cursors).size).toBe(cursors.length);
		expect(socket.closed).toBeNull();
	});
});
