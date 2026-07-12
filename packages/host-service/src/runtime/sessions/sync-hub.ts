import type {
	HelloPacket,
	HostEvent,
	SessionEvent,
	SubscribePacket,
	SyncErrorCode,
	SyncServerPacket,
	ToolResolverDescriptor,
	UnsubscribePacket,
} from "@superset/host-service-sync/protocol";
import { syncClientPacketSchema } from "@superset/host-service-sync/protocol";
import { AcpSessionNotFoundError } from "../acp-sessions";
import {
	CanonicalSessionsError,
	type CanonicalSessionsRuntime,
	type HostChange,
} from "./canonical-sessions";

/**
 * The runtime slice the hub consumes: live feeds plus the synchronous
 * replay accessor. Snapshots ride tRPC, so the hub never composes one.
 * Structural so tests can stub it, though the suite runs against the real
 * runtime over a fake ACP port.
 */
export type SessionsSyncSource = Pick<
	CanonicalSessionsRuntime,
	"onSessionEvent" | "onHostChange" | "warmSession" | "sessionReplay"
>;

// Structural slice of hono/ws's WSContext; `raw` is the underlying `ws`
// socket (present for node-ws), read for `bufferedAmount` back-pressure.
export type SyncSocket = {
	send: (data: string) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
	raw?: { readonly bufferedAmount?: number };
};

export interface SessionsSyncHubOptions {
	runtime: SessionsSyncSource;
	/** Stamped on every hostId-bearing packet; app.ts passes the org id. */
	hostId: string;
	/** Injectable for deterministic tests; stamps hello_ack.serverTime only. */
	now?: () => number;
	limits?: {
		maxSubscriptions?: number;
		maxFrameBytes?: number;
		/** Host-stream retention override; tests shrink it to force expiry. */
		hostRingLimit?: number;
	};
	/** Injectable for deterministic tests; mints hello_ack.connectionId. */
	mintConnectionId?: () => string;
	/**
	 * Tag baked into every host-stream cursor this hub mints. Serials restart
	 * at zero with each hub, so without it a cursor from a previous host
	 * process would be silently accepted once the new serial range covers it,
	 * replaying an unrelated suffix. A per-incarnation tag makes every foreign
	 * cursor CURSOR_INVALID → deterministic snapshot rebuild. Injectable for
	 * deterministic tests; defaults to a random token per hub.
	 */
	hostIncarnation?: string;
}

/** Route-facing handle for one accepted WebSocket. */
export interface SessionsSyncConnection {
	connectionId: string;
	/**
	 * Feed one raw text frame. Processing is serialized per connection; the
	 * returned promise settles when this frame has been handled (tests await
	 * it, the route fires and forgets).
	 */
	handleMessage(raw: string): Promise<void>;
	/** The socket went away, or the route is tearing down. */
	dispose(): void;
}

interface Subscription {
	subscriptionId: string;
	stream: "host" | "session";
	/** Null exactly when stream === "host". */
	sessionId: string | null;
	/**
	 * Cursor of the last packet delivered on this subscription. Replay hands
	 * it off to the live feed; the fan-out skips anything at or below it, so
	 * a fold that lands mid-subscribe is never double-sent.
	 */
	lastCursor: string;
}

interface Connection {
	id: string;
	socket: SyncSocket;
	helloReceived: boolean;
	closed: boolean;
	queue: Promise<void>;
	subscriptions: Map<string, Subscription>;
	toolResolvers: ToolResolverDescriptor[];
}

interface HostRingEntry {
	serial: number;
	cursor: string;
	sessionId: string;
	threadId: string | null;
	event: HostEvent;
}

const PROTOCOL_VERSION = 1;
const SOCKET_OPEN = 1;
const DEFAULT_MAX_SUBSCRIPTIONS = 32;
const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;
// Same rationale as the ACP stream route: with no ACK flow control, a client
// that stops draining would grow the host's send buffer without bound.
// Blowing past this means the client is effectively gone — drop it;
// reconnect-with-cursor replays what it missed.
const WS_SEND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;
/**
 * Host-stream retention. Host events are coalesced row upserts and permission
 * transitions, so this covers hours of activity; a client further behind
 * rebuilds from the tRPC host snapshot via reset → refetchSnapshot.
 */
const HOST_RING_LIMIT = 10_000;

function hostEventFor(change: HostChange): HostEvent {
	switch (change.type) {
		case "sessionUpsert":
			return { type: "sessionUpsert", session: change.session };
		case "sessionRemoved":
			return { type: "sessionRemoved", reason: change.reason };
		case "permissionAvailable":
			return { type: "permissionAvailable", permission: change.permission };
		case "permissionResolved":
			return { type: "permissionResolved", permissionId: change.permissionId };
	}
}

/** Best-effort requestId echo for packets that failed schema validation. */
function extractRequestId(raw: unknown): string | null {
	if (typeof raw !== "object" || raw === null) return null;
	const requestId = (raw as { requestId?: unknown }).requestId;
	return typeof requestId === "string" &&
		requestId.length >= 1 &&
		requestId.length <= 512
		? requestId
		: null;
}

/**
 * The `/sessions/sync` WebSocket server (plans/host-sessions-sync.md).
 * One hub per host process: it subscribes once to the canonical runtime's
 * live feeds and fans packets out to every connection, replaying each
 * subscription from its cursor first so the (fromExclusive, through] window
 * in `subscribed` is exact — snapshot-or-replay, then `caught_up`, then live
 * with no gap. Delivery is at-least-once across reconnects; clients dedupe
 * by event id/cursor.
 */
export class SessionsSyncHub {
	private readonly runtime: SessionsSyncSource;
	private readonly hostId: string;
	private readonly now: () => number;
	private readonly maxSubscriptions: number;
	private readonly maxFrameBytes: number;
	private readonly hostRingLimit: number;
	private readonly mintConnectionId: () => string;
	private readonly hostIncarnation: string;

	private readonly connections = new Set<Connection>();
	private readonly hostRing: HostRingEntry[] = [];
	private hostSerial = 0;
	private connectionSerial = 0;
	private disposed = false;
	private readonly stopSessionFeed: () => void;
	private readonly stopHostFeed: () => void;

	constructor(options: SessionsSyncHubOptions) {
		this.runtime = options.runtime;
		this.hostId = options.hostId;
		this.now = options.now ?? (() => Date.now());
		this.maxSubscriptions =
			options.limits?.maxSubscriptions ?? DEFAULT_MAX_SUBSCRIPTIONS;
		this.maxFrameBytes =
			options.limits?.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
		this.hostRingLimit = options.limits?.hostRingLimit ?? HOST_RING_LIMIT;
		this.mintConnectionId =
			options.mintConnectionId ??
			(() => {
				this.connectionSerial += 1;
				return `conn-${this.connectionSerial}`;
			});
		this.hostIncarnation =
			options.hostIncarnation ?? crypto.randomUUID().slice(0, 8);
		this.stopSessionFeed = this.runtime.onSessionEvent((event) => {
			this.fanOutSessionEvent(event);
		});
		this.stopHostFeed = this.runtime.onHostChange((change) => {
			this.fanOutHostChange(change);
		});
	}

	connect(socket: SyncSocket): SessionsSyncConnection {
		if (this.disposed) {
			// The live feeds are already detached; a subscriber accepted now
			// would snapshot, report caught_up, and never hear another event.
			try {
				socket.close(1001, "host shutting down");
			} catch {
				// best-effort; close may race a socket already going away
			}
			return {
				connectionId: this.mintConnectionId(),
				handleMessage: async () => {},
				dispose: () => {},
			};
		}
		const connection: Connection = {
			id: this.mintConnectionId(),
			socket,
			helloReceived: false,
			closed: false,
			queue: Promise.resolve(),
			subscriptions: new Map(),
			toolResolvers: [],
		};
		this.connections.add(connection);
		return {
			connectionId: connection.id,
			handleMessage: (raw) => this.enqueue(connection, raw),
			dispose: () => {
				this.dropConnection(connection);
			},
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.stopSessionFeed();
		this.stopHostFeed();
		for (const connection of [...this.connections]) {
			this.dropConnection(connection);
			try {
				connection.socket.close(1001, "host shutting down");
			} catch {
				// best-effort; close may race a socket already going away
			}
		}
	}

	// -------------------------------------------------------------------------
	// Packet intake
	// -------------------------------------------------------------------------

	private enqueue(connection: Connection, raw: string): Promise<void> {
		// Serialize per connection so a subscribe's async warm-up can't be
		// overtaken by a later unsubscribe for the same subscription.
		const next = connection.queue.then(() =>
			this.handlePacket(connection, raw),
		);
		connection.queue = next.catch((error) => {
			// handlePacket reports protocol errors itself; anything reaching
			// here is a hub bug, and it must not wedge the queue.
			console.error("[sessions-sync] packet handling failed", error);
		});
		return connection.queue;
	}

	private async handlePacket(
		connection: Connection,
		raw: string,
	): Promise<void> {
		if (connection.closed) return;
		if (raw.length > this.maxFrameBytes) {
			this.sendError(connection, {
				requestId: null,
				code: "INVALID_PACKET",
				retryable: false,
			});
			return;
		}
		let rawPacket: unknown;
		try {
			rawPacket = JSON.parse(raw);
		} catch {
			this.sendError(connection, {
				requestId: null,
				code: "INVALID_PACKET",
				retryable: false,
			});
			if (!connection.helloReceived) {
				this.closeConnection(connection, 1008, "malformed packet before hello");
			}
			return;
		}
		// Version-gate before schema validation: a future hello should learn
		// "unsupported version", not "invalid packet".
		const rawType =
			typeof rawPacket === "object" && rawPacket !== null
				? (rawPacket as { type?: unknown }).type
				: undefined;
		if (rawType === "hello") {
			const version = (rawPacket as { protocolVersion?: unknown })
				.protocolVersion;
			if (version !== PROTOCOL_VERSION) {
				this.sendError(connection, {
					requestId: extractRequestId(rawPacket),
					code: "UNSUPPORTED_PROTOCOL_VERSION",
					retryable: false,
				});
				this.closeConnection(connection, 1008, "unsupported protocol version");
				return;
			}
		}
		const parsed = syncClientPacketSchema.safeParse(rawPacket);
		if (!parsed.success) {
			this.sendError(connection, {
				requestId: extractRequestId(rawPacket),
				code: "INVALID_PACKET",
				retryable: false,
			});
			if (!connection.helloReceived) {
				this.closeConnection(connection, 1008, "invalid packet before hello");
			}
			return;
		}
		const packet = parsed.data;
		if (!connection.helloReceived && packet.type !== "hello") {
			this.sendError(connection, {
				requestId: packet.type === "ping" ? null : packet.requestId,
				code: "INVALID_PACKET",
				retryable: false,
			});
			this.closeConnection(connection, 1008, "hello required");
			return;
		}
		switch (packet.type) {
			case "hello":
				this.handleHello(connection, packet);
				return;
			case "toolResolversChanged":
				connection.toolResolvers = packet.toolResolvers;
				return;
			case "ping":
				this.send(connection, { type: "pong", nonce: packet.nonce });
				return;
			case "subscribe":
				await this.handleSubscribe(connection, packet);
				return;
			case "unsubscribe":
				this.handleUnsubscribe(connection, packet);
				return;
		}
	}

	private handleHello(connection: Connection, packet: HelloPacket): void {
		if (connection.helloReceived) {
			// The original handshake still stands; refuse the re-negotiation
			// without dropping live subscriptions.
			this.sendError(connection, {
				requestId: packet.requestId,
				code: "INVALID_PACKET",
				retryable: false,
			});
			return;
		}
		connection.helloReceived = true;
		connection.toolResolvers = packet.toolResolvers;
		this.send(connection, {
			type: "helloAck",
			protocolVersion: PROTOCOL_VERSION,
			requestId: packet.requestId,
			hostId: this.hostId,
			connectionId: connection.id,
			serverTime: this.now(),
			limits: {
				maxSubscriptions: this.maxSubscriptions,
				maxFrameBytes: this.maxFrameBytes,
			},
		});
	}

	// -------------------------------------------------------------------------
	// Subscribe / unsubscribe
	// -------------------------------------------------------------------------

	private async handleSubscribe(
		connection: Connection,
		packet: SubscribePacket,
	): Promise<void> {
		const sessionId =
			packet.stream.type === "session" ? packet.stream.sessionId : null;
		if (connection.subscriptions.has(packet.subscriptionId)) {
			this.sendError(connection, {
				requestId: packet.requestId,
				subscriptionId: packet.subscriptionId,
				sessionId,
				code: "INVALID_PACKET",
				retryable: false,
			});
			return;
		}
		if (connection.subscriptions.size >= this.maxSubscriptions) {
			this.sendError(connection, {
				requestId: packet.requestId,
				subscriptionId: packet.subscriptionId,
				sessionId,
				code: "SUBSCRIPTION_LIMIT",
				retryable: true,
			});
			return;
		}
		if (packet.stream.type === "host") {
			this.subscribeHost(connection, packet);
			return;
		}
		try {
			await this.runtime.warmSession(packet.stream.sessionId);
		} catch (error) {
			const notFound =
				error instanceof AcpSessionNotFoundError ||
				(error instanceof CanonicalSessionsError && error.code === "NOT_FOUND");
			this.sendError(connection, {
				requestId: packet.requestId,
				subscriptionId: packet.subscriptionId,
				sessionId,
				code: notFound ? "SESSION_NOT_FOUND" : "INTERNAL_ERROR",
				retryable: !notFound,
			});
			return;
		}
		if (connection.closed) return;
		this.subscribeSession(connection, packet, packet.stream.sessionId);
	}

	/**
	 * Runs synchronously after the warm-up: capture head, send
	 * subscribed → replay → caughtUp, register at the head. No awaits, so a
	 * fold cannot land between the capture and the registration — that is the
	 * whole no-gap argument. `after` always exists (the client took it from a
	 * tRPC snapshot); an unservable one answers `reset` and the client re-runs
	 * the tRPC cold path.
	 */
	private subscribeSession(
		connection: Connection,
		packet: SubscribePacket,
		sessionId: string,
	): void {
		const replay = this.runtime.sessionReplay(sessionId, packet.after);
		if (!replay.ok) {
			if (replay.reason === "foreign_cursor") {
				// Like a host cursor from a dead hub incarnation: a cursor from a
				// dead log generation (a previous tracking, usually a previous
				// host process) is irrecoverable per-cursor; the client rebuilds
				// from the tRPC snapshot.
				this.send(connection, {
					type: "reset",
					subscriptionId: packet.subscriptionId,
					stream: "session",
					sessionId,
					code: "CURSOR_INVALID",
					recovery: "refetchSnapshot",
				});
				return;
			}
			// Untracked immediately after a successful warm: a dispose or
			// port-side eviction raced the subscribe.
			this.sendError(connection, {
				requestId: packet.requestId,
				subscriptionId: packet.subscriptionId,
				sessionId,
				code: "INTERNAL_ERROR",
				retryable: true,
			});
			return;
		}
		const sent = this.send(connection, {
			type: "subscribed",
			requestId: packet.requestId,
			subscriptionId: packet.subscriptionId,
			stream: "session",
			sessionId,
			replay: { fromExclusive: packet.after, through: replay.head },
		});
		if (!sent) return;
		for (const event of replay.events) {
			const ok = this.send(connection, {
				type: "event",
				hostId: this.hostId,
				subscriptionId: packet.subscriptionId,
				stream: "session",
				sessionId,
				threadId: event.threadId,
				cursor: event.cursor,
				event,
			});
			if (!ok) return;
		}
		const caughtUp = this.send(connection, {
			type: "caughtUp",
			subscriptionId: packet.subscriptionId,
			stream: "session",
			sessionId,
			through: replay.head,
		});
		if (!caughtUp) return;
		connection.subscriptions.set(packet.subscriptionId, {
			subscriptionId: packet.subscriptionId,
			stream: "session",
			sessionId,
			lastCursor: replay.head,
		});
	}

	private hostCursorFor(serial: number): string {
		return `h${this.hostIncarnation}-${String(serial).padStart(12, "0")}`;
	}

	/**
	 * The current host-stream head. `sessions.list` stamps it on the tRPC
	 * host snapshot so clients subscribe from exactly where the snapshot was
	 * taken; replay overlap is harmless because host events are idempotent.
	 */
	hostHead(): string {
		return this.hostCursorFor(this.hostSerial);
	}

	/** Null for anything that is not a cursor this hub incarnation minted. */
	private parseHostCursor(cursor: string): number | null {
		const prefix = `h${this.hostIncarnation}-`;
		if (!cursor.startsWith(prefix)) return null;
		const digits = cursor.slice(prefix.length);
		if (!/^\d{12}$/.test(digits)) return null;
		return Number(digits);
	}

	private subscribeHost(connection: Connection, packet: SubscribePacket): void {
		const head = this.hostCursorFor(this.hostSerial);
		const afterSerial = this.parseHostCursor(packet.after);
		if (afterSerial === null || afterSerial > this.hostSerial) {
			this.send(connection, {
				type: "reset",
				subscriptionId: packet.subscriptionId,
				stream: "host",
				sessionId: null,
				code: "CURSOR_INVALID",
				recovery: "refetchSnapshot",
			});
			return;
		}
		const oldestSerial = this.hostRing[0]?.serial ?? this.hostSerial + 1;
		if (afterSerial < this.hostSerial && afterSerial < oldestSerial - 1) {
			this.send(connection, {
				type: "reset",
				subscriptionId: packet.subscriptionId,
				stream: "host",
				sessionId: null,
				code: "CURSOR_EXPIRED",
				recovery: "refetchSnapshot",
			});
			return;
		}
		const sent = this.send(connection, {
			type: "subscribed",
			requestId: packet.requestId,
			subscriptionId: packet.subscriptionId,
			stream: "host",
			sessionId: null,
			replay: { fromExclusive: packet.after, through: head },
		});
		if (!sent) return;
		for (const entry of this.hostRing) {
			if (entry.serial <= afterSerial) continue;
			if (!this.sendHostEvent(connection, packet.subscriptionId, entry)) {
				return;
			}
		}
		const caughtUp = this.send(connection, {
			type: "caughtUp",
			subscriptionId: packet.subscriptionId,
			stream: "host",
			sessionId: null,
			through: head,
		});
		if (!caughtUp) return;
		connection.subscriptions.set(packet.subscriptionId, {
			subscriptionId: packet.subscriptionId,
			stream: "host",
			sessionId: null,
			lastCursor: head,
		});
	}

	private handleUnsubscribe(
		connection: Connection,
		packet: UnsubscribePacket,
	): void {
		const subscription = connection.subscriptions.get(packet.subscriptionId);
		if (!subscription) {
			// `unsubscribed` requires a stream we don't know; an unknown id is a
			// client-side bookkeeping bug, so answer with an explicit error.
			this.sendError(connection, {
				requestId: packet.requestId,
				subscriptionId: packet.subscriptionId,
				code: "INVALID_PACKET",
				retryable: false,
			});
			return;
		}
		connection.subscriptions.delete(packet.subscriptionId);
		this.send(connection, {
			type: "unsubscribed",
			requestId: packet.requestId,
			subscriptionId: packet.subscriptionId,
			stream: subscription.stream,
			sessionId: subscription.sessionId,
			through: subscription.lastCursor,
		});
	}

	// -------------------------------------------------------------------------
	// Live fan-out
	// -------------------------------------------------------------------------

	private fanOutSessionEvent(event: SessionEvent): void {
		for (const connection of [...this.connections]) {
			for (const subscription of [...connection.subscriptions.values()]) {
				if (connection.closed) break;
				if (
					subscription.stream !== "session" ||
					subscription.sessionId !== event.sessionId
				) {
					continue;
				}
				// Padded cursors make the string compare a serial compare; at or
				// below lastCursor means the replay window already carried it.
				if (event.cursor <= subscription.lastCursor) continue;
				const sent = this.send(connection, {
					type: "event",
					hostId: this.hostId,
					subscriptionId: subscription.subscriptionId,
					stream: "session",
					sessionId: event.sessionId,
					threadId: event.threadId,
					cursor: event.cursor,
					event,
				});
				if (sent) subscription.lastCursor = event.cursor;
			}
		}
	}

	private fanOutHostChange(change: HostChange): void {
		this.hostSerial += 1;
		const entry: HostRingEntry = {
			serial: this.hostSerial,
			cursor: this.hostCursorFor(this.hostSerial),
			sessionId: change.sessionId,
			threadId: change.type === "permissionAvailable" ? change.threadId : null,
			event: hostEventFor(change),
		};
		this.hostRing.push(entry);
		if (this.hostRing.length > this.hostRingLimit) this.hostRing.shift();
		for (const connection of [...this.connections]) {
			for (const subscription of [...connection.subscriptions.values()]) {
				if (connection.closed) break;
				if (subscription.stream !== "host") continue;
				if (entry.cursor <= subscription.lastCursor) continue;
				if (
					this.sendHostEvent(connection, subscription.subscriptionId, entry)
				) {
					subscription.lastCursor = entry.cursor;
				}
			}
		}
	}

	private sendHostEvent(
		connection: Connection,
		subscriptionId: string,
		entry: HostRingEntry,
	): boolean {
		return this.send(connection, {
			type: "event",
			hostId: this.hostId,
			subscriptionId,
			stream: "host",
			sessionId: entry.sessionId,
			threadId: entry.threadId,
			cursor: entry.cursor,
			event: entry.event,
		});
	}

	// -------------------------------------------------------------------------
	// Socket plumbing
	// -------------------------------------------------------------------------

	private send(connection: Connection, packet: SyncServerPacket): boolean {
		if (connection.closed) return false;
		const socket = connection.socket;
		if (socket.readyState !== SOCKET_OPEN) {
			this.dropConnection(connection);
			return false;
		}
		if ((socket.raw?.bufferedAmount ?? 0) > WS_SEND_BUFFER_CAP_BYTES) {
			this.dropConnection(connection);
			try {
				socket.close(1013, "sync back-pressure");
			} catch {
				// best-effort; close may race an already-closing socket
			}
			return false;
		}
		try {
			socket.send(JSON.stringify(packet));
		} catch {
			// A synchronous send throw (torn socket, ws internals) must not leave
			// the connection registered as if delivery succeeded — callers treat
			// `false` as "stop this frame sequence", and the client re-syncs by
			// cursor on reconnect.
			this.dropConnection(connection);
			try {
				socket.close(1011, "sync send failed");
			} catch {
				// best-effort; close may race an already-closing socket
			}
			return false;
		}
		return true;
	}

	private sendError(
		connection: Connection,
		fields: {
			requestId: string | null;
			subscriptionId?: string | null;
			sessionId?: string | null;
			code: SyncErrorCode;
			retryable: boolean;
		},
	): void {
		this.send(connection, {
			type: "error",
			requestId: fields.requestId,
			subscriptionId: fields.subscriptionId ?? null,
			sessionId: fields.sessionId ?? null,
			code: fields.code,
			retryable: fields.retryable,
		});
	}

	private closeConnection(
		connection: Connection,
		code: number,
		reason: string,
	): void {
		this.dropConnection(connection);
		try {
			connection.socket.close(code, reason);
		} catch {
			// best-effort; close may race an already-closing socket
		}
	}

	private dropConnection(connection: Connection): void {
		connection.closed = true;
		connection.subscriptions.clear();
		this.connections.delete(connection);
	}
}
