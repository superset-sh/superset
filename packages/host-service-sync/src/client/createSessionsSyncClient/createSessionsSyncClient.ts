import { createStore } from "zustand/vanilla";
import {
	clientInstanceIdSchema,
	clientVersionSchema,
	type EventsWindow,
	eventsWindowSchema,
	getEventsInputSchema,
	getSessionInputSchema,
	hostSnapshotSchema,
	resolveToolCallInputSchema,
	SESSIONS_SYNC_WEBSOCKET_PROTOCOL,
	type SessionId,
	type SyncClientPacket,
	type SyncServerPacket,
	sessionIdSchema,
	sessionSnapshotSchema,
	syncClientPacketSchema,
	syncServerPacketSchema,
	type ToolResolverDescriptor,
	toolCallIdSchema,
	toolResolverDescriptorSchema,
} from "../../protocol";
import type {
	CreateSessionsSyncClientOptions,
	SessionRetention,
	SessionStreamState,
	SessionsSyncClient,
	SessionsSyncLogEvent,
	SessionsSyncState,
	WebSocketLike,
} from "../types";
import {
	applyHostEvent,
	applyHostSnapshot,
	applySessionSnapshot,
	createEmptyStream,
	createInitialState,
	mergeSessionEvents,
	resolveLimits,
} from "./state";

const SOCKET_OPEN = 1;
const MAX_RECONNECT_DELAY_MS = 30_000;
const HOST_SUBSCRIPTION_ID = "host";
const DEFAULT_HISTORY_WINDOW = 50;
const HOST_RESET_KEY = "$host";

function createPlatformWebSocket(
	url: string,
	protocols: string[],
): WebSocketLike {
	const nativeSocket = new WebSocket(url, protocols);
	const adapter: WebSocketLike = {
		get readyState() {
			return nativeSocket.readyState;
		},
		get bufferedAmount() {
			return nativeSocket.bufferedAmount;
		},
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
		send(data) {
			nativeSocket.send(data);
		},
		close(code, reason) {
			nativeSocket.close(code, reason);
		},
	};
	nativeSocket.onopen = () => adapter.onopen?.();
	nativeSocket.onmessage = (event) => adapter.onmessage?.({ data: event.data });
	nativeSocket.onclose = (event) =>
		adapter.onclose?.({
			code: event.code,
			reason: event.reason,
			wasClean: event.wasClean,
		});
	nativeSocket.onerror = (event) => adapter.onerror?.(event);
	return adapter;
}

export function createSessionsSyncClient(
	options: CreateSessionsSyncClientOptions,
): SessionsSyncClient {
	clientInstanceIdSchema.parse(options.clientInstanceId);
	clientVersionSchema.parse(options.clientVersion);
	if (!options.api) {
		throw new Error("sessions sync client requires a sessions API facade");
	}
	const api = options.api;
	const now = options.now ?? Date.now;
	const limits = resolveLimits(options.limits);
	const store = createStore<SessionsSyncState>(() => createInitialState());
	const createWebSocket = options.createWebSocket ?? createPlatformWebSocket;
	const reconnectDelayMs = options.reconnectDelayMs ?? 500;
	if (!Number.isSafeInteger(reconnectDelayMs) || reconnectDelayMs < 0) {
		throw new Error(
			`invalid sessions sync reconnect delay: ${reconnectDelayMs}`,
		);
	}
	const retainReasons = new Map<
		SessionId,
		Record<Exclude<SessionRetention, "none">, number>
	>();
	const warmTimers = new Map<SessionId, ReturnType<typeof setTimeout>>();
	const resolverCounts = new Map<
		string,
		{ descriptor: ToolResolverDescriptor; count: number }
	>();
	const seedPromises = new Map<SessionId, Promise<void>>();
	/**
	 * Reset circuit breaker per stream (host + sessions). A stream whose
	 * resets exceed the window budget parks in `error` instead of looping
	 * the cold path — a reset loop is a host bug the client cannot fix.
	 */
	const resetWindows = new Map<
		string,
		{ count: number; windowStart: number }
	>();
	/**
	 * Sessions whose subscribe packet went out on the CURRENT socket. An
	 * unsubscribe is only valid for these — e.g. a `sessionRemoved` for a
	 * session we never subscribed must not send one, because the hub answers
	 * unknown-subscription unsubscribes with an explicit error frame.
	 */
	const sentSessionSubscriptions = new Set<SessionId>();

	let socket: WebSocketLike | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let connectionEpoch = 0;
	let reconnectAttempts = 0;
	let requestCounter = 0;
	let stopped = true;
	let negotiatedMaxFrameBytes = limits.maxFrameBytes;
	let helloRequestId: string | null = null;
	let hostSeedEpoch = -1;
	let hostSeedPromise: Promise<void> | null = null;

	function log(event: SessionsSyncLogEvent): void {
		options.logger?.log(event);
	}

	function nextRequestId(): string {
		requestCounter += 1;
		return `${options.clientInstanceId}:${requestCounter}`;
	}

	function activeToolResolvers(): ToolResolverDescriptor[] {
		return [...resolverCounts.values()]
			.map((entry) => entry.descriptor)
			.sort(
				(left, right) =>
					left.name.localeCompare(right.name) || left.version - right.version,
			);
	}

	function setConnection(
		patch: Partial<SessionsSyncState["connection"]>,
	): void {
		store.setState((state) => ({
			connection: { ...state.connection, ...patch },
		}));
	}

	function setHostSubscription(
		patch: Partial<SessionsSyncState["hostSubscription"]>,
	): void {
		store.setState((state) => ({
			hostSubscription: { ...state.hostSubscription, ...patch },
		}));
	}

	function setSessionStream(
		sessionId: SessionId,
		patch: Partial<SessionStreamState>,
	): void {
		store.setState((state) => {
			const current =
				state.streamsBySessionId[sessionId] ?? createEmptyStream(now());
			return {
				streamsBySessionId: {
					...state.streamsBySessionId,
					[sessionId]: { ...current, ...patch },
				},
			};
		});
	}

	function isConnected(): boolean {
		return (
			socket?.readyState === SOCKET_OPEN &&
			store.getState().connection.status === "connected"
		);
	}

	function send(packet: SyncClientPacket): boolean {
		const current = socket;
		if (!current || current.readyState !== SOCKET_OPEN) return false;
		const parsed = syncClientPacketSchema.safeParse(packet);
		if (!parsed.success) {
			throw new Error(`invalid outbound sessions sync packet: ${packet.type}`);
		}
		const queuedBytes = current.bufferedAmount ?? 0;
		if (queuedBytes > limits.maxSocketQueuedBytes) {
			log({
				event: "sessions_sync.socket_dropped",
				reason: "send_buffer_limit",
				queuedBytes,
				limitBytes: limits.maxSocketQueuedBytes,
			});
			current.close(1013, "sync send buffer exceeded");
			return false;
		}
		current.send(JSON.stringify(parsed.data));
		return true;
	}

	function sessionSubscriptionId(sessionId: SessionId): string {
		return `session:${sessionId}`;
	}

	/** Inverse of `sessionSubscriptionId` for ids echoed back by the server. */
	function sessionIdFromSubscriptionId(
		subscriptionId: string | null,
	): SessionId | null {
		if (!subscriptionId?.startsWith("session:")) return null;
		return subscriptionId.slice("session:".length);
	}

	/**
	 * Returns false when the stream's reset budget is exhausted — the caller
	 * must park the stream instead of re-running the cold path.
	 */
	function admitReset(key: string, sessionId: SessionId | null): boolean {
		const at = now();
		const entry = resetWindows.get(key);
		if (!entry || at - entry.windowStart > limits.streamResetWindowMs) {
			resetWindows.set(key, { count: 1, windowStart: at });
			return true;
		}
		entry.count += 1;
		if (entry.count > limits.maxStreamResetsPerWindow) {
			log({
				event: "sessions_sync.reset_loop",
				sessionId,
				resets: entry.count,
				windowMs: limits.streamResetWindowMs,
			});
			return false;
		}
		return true;
	}

	function wantsSession(sessionId: SessionId): boolean {
		// A session with no stream yet is NOT desired — treating `undefined`
		// as desired made retainSession skip the initial seed+subscribe for
		// sessions first retained while already connected.
		const retention =
			store.getState().streamsBySessionId[sessionId]?.retention ?? "none";
		return retention !== "none";
	}

	function sendHostSubscription(after: string): void {
		setHostSubscription({ status: "subscribing" });
		send({
			type: "subscribe",
			requestId: nextRequestId(),
			subscriptionId: HOST_SUBSCRIPTION_ID,
			stream: { type: "host" },
			after,
		});
	}

	/**
	 * The host-stream cold path: with a cursor, resume straight over the
	 * socket; without one, fetch the host snapshot over tRPC and subscribe
	 * from its head. Reset recovery re-enters here with a nulled cursor, so
	 * recovery IS the cold path.
	 */
	function seedHostAndSubscribe(): void {
		if (!isConnected()) return;
		const cursor = store.getState().hostSubscription.latestCursor;
		if (cursor !== null) {
			sendHostSubscription(cursor);
			return;
		}
		if (hostSeedPromise && hostSeedEpoch === connectionEpoch) return;
		hostSeedEpoch = connectionEpoch;
		setHostSubscription({ status: "subscribing" });
		const epoch = connectionEpoch;
		hostSeedPromise = api
			.list()
			.then((value) => {
				if (stopped || epoch !== connectionEpoch) return;
				const snapshot = hostSnapshotSchema.parse(value);
				// Retained sessions the host no longer lists are gone for good —
				// stop wanting them before the stale streams get pruned.
				const listed = new Set(snapshot.sessions.map((session) => session.id));
				for (const retained of [...retainReasons.keys()]) {
					if (listed.has(retained)) continue;
					retainReasons.delete(retained);
					clearWarmTimer(retained);
					unsubscribeSession(retained);
				}
				store.setState(applyHostSnapshot(store.getState(), snapshot), true);
				if (snapshot.head !== null) {
					sendHostSubscription(snapshot.head);
				}
			})
			.catch(() => {
				if (stopped || epoch !== connectionEpoch) return;
				setHostSubscription({ status: "error" });
				setConnection({
					error: { code: "HOST_SNAPSHOT_FAILED", retryable: true },
				});
			})
			.finally(() => {
				if (hostSeedEpoch === epoch) hostSeedPromise = null;
			});
	}

	function sendSessionSubscription(sessionId: SessionId): void {
		if (!isConnected() || !wantsSession(sessionId)) return;
		const stream = store.getState().streamsBySessionId[sessionId];
		const after = stream?.latestCursor;
		if (!after) return;
		setSessionStream(sessionId, { status: "subscribing", error: null });
		const sent = send({
			type: "subscribe",
			requestId: nextRequestId(),
			subscriptionId: sessionSubscriptionId(sessionId),
			stream: { type: "session", sessionId },
			after,
		});
		if (sent) sentSessionSubscriptions.add(sessionId);
	}

	function applyWindow(
		sessionId: SessionId,
		window: EventsWindow,
		position: "prepend" | "replace",
	): void {
		const result = mergeSessionEvents({
			state: store.getState(),
			sessionId,
			events: window.items,
			position,
			...(position === "replace" ? { latestCursor: window.head } : {}),
			hasMoreBefore: window.range.hasMoreBefore,
			now: now(),
			limits,
		});
		store.setState(result.state, true);
		for (const event of result.logs) log(event);
	}

	/**
	 * The session-stream cold path: with a cursor, resume straight over the
	 * socket; without one, fetch the session snapshot over tRPC (projection +
	 * recent tail + head) and subscribe from its head.
	 */
	function seedAndSubscribe(sessionId: SessionId): void {
		if (!isConnected() || !wantsSession(sessionId)) return;
		const stream = store.getState().streamsBySessionId[sessionId];
		if (stream?.latestCursor != null) {
			sendSessionSubscription(sessionId);
			return;
		}
		if (seedPromises.has(sessionId)) return;
		setSessionStream(sessionId, { status: "subscribing", error: null });
		const promise = api
			.get(getSessionInputSchema.parse({ sessionId }))
			.then((value) => {
				// Released or removed while the seed was in flight: folding the
				// snapshot now would recreate a ghost stream nothing owns.
				if (!wantsSession(sessionId)) return;
				const snapshot = sessionSnapshotSchema.parse(value);
				if (snapshot.session.id !== sessionId) {
					throw new Error("session snapshot response identity mismatch");
				}
				store.setState(
					applySessionSnapshot(store.getState(), snapshot, now()),
					true,
				);
				sendSessionSubscription(sessionId);
			})
			.catch(() => {
				setSessionStream(sessionId, {
					status: "error",
					error: { code: "SNAPSHOT_LOAD_FAILED", retryable: true },
				});
			})
			.finally(() => {
				seedPromises.delete(sessionId);
			});
		seedPromises.set(sessionId, promise);
	}

	function unsubscribeSession(sessionId: SessionId): void {
		if (sentSessionSubscriptions.delete(sessionId) && isConnected()) {
			send({
				type: "unsubscribe",
				requestId: nextRequestId(),
				subscriptionId: sessionSubscriptionId(sessionId),
			});
		}
		setSessionStream(sessionId, { status: "idle" });
	}

	/**
	 * The socket is gone: every stream that claimed to be live is now merely
	 * cached. Downgrade to `idle` (data and cursors intact) so "live" always
	 * means "caught up on an open socket" — error/reset statuses survive.
	 */
	function markStreamsDisconnected(): void {
		const stale = new Set(["subscribing", "replaying", "live"]);
		store.setState((state) => ({
			hostSubscription: stale.has(state.hostSubscription.status)
				? { ...state.hostSubscription, status: "idle" as const }
				: state.hostSubscription,
			streamsBySessionId: Object.fromEntries(
				Object.entries(state.streamsBySessionId).map(([sessionId, stream]) => [
					sessionId,
					stale.has(stream.status)
						? { ...stream, status: "idle" as const }
						: stream,
				]),
			),
		}));
	}

	function scheduleReconnect(): void {
		if (stopped || reconnectTimer) return;
		setConnection({ status: "reconnecting" });
		const delay = Math.min(
			reconnectDelayMs * 2 ** reconnectAttempts,
			MAX_RECONNECT_DELAY_MS,
		);
		reconnectAttempts += 1;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			openConnection();
		}, delay);
	}

	function dropInvalidSocket(
		reason: "invalid_frame" | "frame_size_limit",
	): void {
		log({
			event: "sessions_sync.socket_dropped",
			reason,
			queuedBytes: null,
			limitBytes: negotiatedMaxFrameBytes,
		});
		socket?.close(1008, reason.replaceAll("_", " "));
	}

	function handleServerPacket(packet: SyncServerPacket): void {
		if (packet.type === "helloAck") {
			helloRequestId = null;
			negotiatedMaxFrameBytes = Math.min(
				limits.maxFrameBytes,
				packet.limits.maxFrameBytes,
			);
			reconnectAttempts = 0;
			setConnection({
				status: "connected",
				hostId: packet.hostId,
				connectionId: packet.connectionId,
				error: null,
			});
			seedHostAndSubscribe();
			for (const [sessionId, stream] of Object.entries(
				store.getState().streamsBySessionId,
			)) {
				if (stream.retention !== "none") seedAndSubscribe(sessionId);
			}
			return;
		}

		if (packet.type === "event" && packet.stream === "host") {
			if (packet.event.type === "sessionRemoved") {
				retainReasons.delete(packet.sessionId);
				clearWarmTimer(packet.sessionId);
				unsubscribeSession(packet.sessionId);
			}
			store.setState(applyHostEvent(store.getState(), packet), true);
			return;
		}

		if (packet.type === "event" && packet.stream === "session") {
			const result = mergeSessionEvents({
				state: store.getState(),
				sessionId: packet.sessionId,
				events: [packet.event],
				position: "append",
				latestCursor: packet.cursor,
				now: now(),
				limits,
			});
			store.setState(result.state, true);
			for (const event of result.logs) log(event);
			return;
		}

		if (packet.type === "subscribed") {
			if (packet.stream === "host") {
				setHostSubscription({ status: "replaying" });
			} else if (packet.sessionId) {
				setSessionStream(packet.sessionId, { status: "replaying" });
			}
			return;
		}

		if (packet.type === "caughtUp") {
			if (packet.stream === "host") {
				resetWindows.delete(HOST_RESET_KEY);
				store.setState({
					hostSubscription: {
						status: "live",
						latestCursor: packet.through,
					},
				});
			} else if (packet.sessionId) {
				resetWindows.delete(packet.sessionId);
				setSessionStream(packet.sessionId, {
					status: "live",
					latestCursor: packet.through,
				});
			}
			return;
		}

		if (packet.type === "unsubscribed") {
			if (packet.sessionId) {
				setSessionStream(packet.sessionId, { status: "idle" });
			}
			return;
		}

		if (packet.type === "reset") {
			log({
				event: "sessions_sync.stream_reset",
				sessionId: packet.sessionId,
				code: packet.code,
				recovery: packet.recovery,
			});
			if (packet.stream === "host") {
				if (!admitReset(HOST_RESET_KEY, null)) {
					store.setState({
						hostSubscription: { status: "error", latestCursor: null },
					});
					return;
				}
				store.setState({
					hostSubscription: { status: "reset", latestCursor: null },
				});
				seedHostAndSubscribe();
			} else if (packet.sessionId) {
				if (!admitReset(packet.sessionId, packet.sessionId)) {
					setSessionStream(packet.sessionId, {
						status: "error",
						latestCursor: null,
						error: { code: "RESET_LOOP", retryable: true },
					});
					return;
				}
				setSessionStream(packet.sessionId, {
					status: "reset",
					latestCursor: null,
				});
				seedAndSubscribe(packet.sessionId);
			}
			return;
		}

		if (packet.type === "error") {
			if (packet.requestId === helloRequestId) {
				helloRequestId = null;
				setConnection({
					status: packet.retryable ? "reconnecting" : "disconnected",
					error: { code: packet.code, retryable: packet.retryable },
				});
				if (!packet.retryable) stopped = true;
				socket?.close(1008, "sessions sync hello rejected");
				return;
			}
			if (packet.sessionId) {
				setSessionStream(packet.sessionId, {
					status: "error",
					error: { code: packet.code, retryable: packet.retryable },
				});
				return;
			}
			const scoped = sessionIdFromSubscriptionId(packet.subscriptionId);
			if (scoped !== null) {
				// A session-scoped echo the server could not resolve to a stream
				// (e.g. answering an unsubscribe it does not hold). Never
				// connection-fatal; fold it only into a stream that still expects
				// traffic.
				const stream = store.getState().streamsBySessionId[scoped];
				if (stream && stream.status !== "idle") {
					setSessionStream(scoped, {
						status: "error",
						error: { code: packet.code, retryable: packet.retryable },
					});
				}
				return;
			}
			setConnection({
				error: { code: packet.code, retryable: packet.retryable },
			});
		}
	}

	function hasValidPacketContext(packet: SyncServerPacket): boolean {
		const state = store.getState();
		if (packet.type === "helloAck") {
			return (
				helloRequestId !== null &&
				packet.requestId === helloRequestId &&
				state.connection.status !== "connected" &&
				(state.connection.hostId === null ||
					state.connection.hostId === packet.hostId)
			);
		}
		if (
			packet.type === "error" &&
			helloRequestId !== null &&
			packet.requestId === helloRequestId
		) {
			return packet.subscriptionId === null && packet.sessionId === null;
		}
		if (
			helloRequestId !== null ||
			state.connection.status !== "connected" ||
			state.connection.hostId === null
		) {
			return false;
		}
		if ("hostId" in packet && packet.hostId !== state.connection.hostId) {
			return false;
		}

		switch (packet.type) {
			case "event":
				return packet.stream === "host"
					? packet.subscriptionId === HOST_SUBSCRIPTION_ID
					: packet.subscriptionId === sessionSubscriptionId(packet.sessionId);
			case "subscribed":
			case "caughtUp":
			case "unsubscribed":
			case "reset":
				return packet.stream === "host"
					? packet.subscriptionId === HOST_SUBSCRIPTION_ID
					: packet.sessionId !== null &&
							packet.subscriptionId === sessionSubscriptionId(packet.sessionId);
			case "error":
				// A null sessionId with any subscriptionId is valid: the server
				// echoes ids it cannot resolve to a stream (e.g. an unsubscribe
				// for a subscription it does not hold).
				if (packet.subscriptionId === null || packet.sessionId === null) {
					return true;
				}
				return (
					packet.subscriptionId === sessionSubscriptionId(packet.sessionId)
				);
			case "pong":
				return true;
		}
	}

	/**
	 * Session-scoped packets that create or mutate stream/projection state
	 * are honored only for sessions whose subscribe went out on THIS socket.
	 * Anything else (a misrouted frame, a straggler after an unsubscribe) is
	 * dropped without folding — but never connection-fatal, because in-flight
	 * frames legitimately race a just-sent unsubscribe.
	 */
	function unscopedSessionIdOf(packet: SyncServerPacket): SessionId | null {
		switch (packet.type) {
			case "event":
				return packet.stream === "session" &&
					!sentSessionSubscriptions.has(packet.sessionId)
					? packet.sessionId
					: null;
			case "subscribed":
			case "caughtUp":
			case "reset":
				return packet.stream === "session" &&
					packet.sessionId !== null &&
					!sentSessionSubscriptions.has(packet.sessionId)
					? packet.sessionId
					: null;
			default:
				return null;
		}
	}

	function handleRawFrame(data: unknown): void {
		if (typeof data !== "string") {
			dropInvalidSocket("invalid_frame");
			return;
		}
		if (data.length * 2 > negotiatedMaxFrameBytes) {
			dropInvalidSocket("frame_size_limit");
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(data);
		} catch {
			dropInvalidSocket("invalid_frame");
			return;
		}
		const result = syncServerPacketSchema.safeParse(parsed);
		if (!result.success) {
			dropInvalidSocket("invalid_frame");
			return;
		}
		if (!hasValidPacketContext(result.data)) {
			dropInvalidSocket("invalid_frame");
			return;
		}
		const staleSessionId = unscopedSessionIdOf(result.data);
		if (staleSessionId !== null) {
			log({
				event: "sessions_sync.stale_packet_dropped",
				sessionId: staleSessionId,
				packetType: result.data.type,
			});
			return;
		}
		handleServerPacket(result.data);
	}

	function attachSocket(url: string, epoch: number): void {
		if (stopped || epoch !== connectionEpoch) return;
		let created: WebSocketLike;
		try {
			created = createWebSocket(url, [SESSIONS_SYNC_WEBSOCKET_PROTOCOL]);
		} catch {
			// Surface the failure — a silent retry loop with a null error is
			// undiagnosable from the outside.
			log({
				event: "sessions_sync.connect_failed",
				reason: "socket_factory_threw",
			});
			setConnection({
				error: { code: "SOCKET_FACTORY_FAILED", retryable: true },
			});
			scheduleReconnect();
			return;
		}
		socket = created;
		created.onopen = () => {
			if (socket !== created || stopped) return;
			helloRequestId = nextRequestId();
			const hello: SyncClientPacket = {
				type: "hello",
				protocolVersion: 1,
				requestId: helloRequestId,
				clientInstanceId: options.clientInstanceId,
				clientVersion: options.clientVersion,
				toolResolvers: activeToolResolvers(),
			};
			send(hello);
		};
		created.onmessage = (event) => {
			if (socket !== created || stopped) return;
			handleRawFrame(event.data);
		};
		created.onerror = () => {
			// The close event owns reconnect scheduling.
		};
		created.onclose = () => {
			if (socket !== created) return;
			socket = null;
			helloRequestId = null;
			sentSessionSubscriptions.clear();
			markStreamsDisconnected();
			if (!stopped) scheduleReconnect();
		};
	}

	function openConnection(): void {
		if (stopped || socket) return;
		const epoch = ++connectionEpoch;
		setConnection({
			status: reconnectAttempts === 0 ? "connecting" : "reconnecting",
			error: null,
		});
		const failSyncUrl = (): void => {
			log({ event: "sessions_sync.connect_failed", reason: "sync_url_failed" });
			setConnection({ error: { code: "SYNC_URL_FAILED", retryable: true } });
			scheduleReconnect();
		};
		let value: string | Promise<string>;
		try {
			value =
				typeof options.syncUrl === "function"
					? options.syncUrl()
					: options.syncUrl;
		} catch {
			failSyncUrl();
			return;
		}
		if (typeof value === "string") {
			attachSocket(value, epoch);
			return;
		}
		void value.then(
			(url) => attachSocket(url, epoch),
			() => failSyncUrl(),
		);
	}

	function currentRetention(
		counts: Record<Exclude<SessionRetention, "none">, number>,
	): Exclude<SessionRetention, "none"> {
		if (counts.focused > 0) return "focused";
		if (counts.running > 0) return "running";
		return "warm";
	}

	function clearWarmTimer(sessionId: SessionId): void {
		const timer = warmTimers.get(sessionId);
		if (timer) clearTimeout(timer);
		warmTimers.delete(sessionId);
	}

	function disposeWarm(
		sessionId: SessionId,
		reason: "warm_lru_eviction" | "warm_ttl",
		warmRank: number | null,
	): void {
		const stream = store.getState().streamsBySessionId[sessionId];
		if (!stream || stream.retainCount > 0 || stream.retention !== "warm")
			return;
		clearWarmTimer(sessionId);
		unsubscribeSession(sessionId);
		setSessionStream(sessionId, { retention: "none", retainCount: 0 });
		log({
			event: "sessions_sync.subscription_disposed",
			sessionId,
			reason,
			warmRank,
			latestCursor: stream.latestCursor,
		});
	}

	function enforceWarmLimit(): void {
		const warm = Object.entries(store.getState().streamsBySessionId)
			.filter(
				([, stream]) => stream.retention === "warm" && stream.retainCount === 0,
			)
			.sort(
				([, left], [, right]) => right.lastAccessedAt - left.lastAccessedAt,
			);
		for (
			let index = limits.maxWarmSubscriptions;
			index < warm.length;
			index++
		) {
			const sessionId = warm[index]?.[0];
			if (sessionId) disposeWarm(sessionId, "warm_lru_eviction", index + 1);
		}
	}

	function scheduleWarmExpiry(sessionId: SessionId): void {
		clearWarmTimer(sessionId);
		const timer = setTimeout(() => {
			warmTimers.delete(sessionId);
			disposeWarm(sessionId, "warm_ttl", null);
		}, limits.warmSubscriptionTtlMs);
		warmTimers.set(sessionId, timer);
	}

	return {
		store,

		connect(): void {
			if (!stopped) return;
			stopped = false;
			resetWindows.clear();
			for (const [sessionId, stream] of Object.entries(
				store.getState().streamsBySessionId,
			)) {
				if (stream.retention === "warm" && stream.retainCount === 0) {
					scheduleWarmExpiry(sessionId);
				}
			}
			openConnection();
		},

		disconnect(): void {
			for (const timer of warmTimers.values()) clearTimeout(timer);
			warmTimers.clear();
			if (stopped) return;
			stopped = true;
			connectionEpoch += 1;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			reconnectTimer = null;
			const current = socket;
			socket = null;
			helloRequestId = null;
			sentSessionSubscriptions.clear();
			if (current) {
				current.onopen = null;
				current.onmessage = null;
				current.onerror = null;
				current.onclose = null;
				current.close(1000, "sync client disconnected");
			}
			markStreamsDisconnected();
			setConnection({
				status: "disconnected",
				connectionId: null,
			});
		},

		retainSession(sessionId, reason) {
			sessionIdSchema.parse(sessionId);
			clearWarmTimer(sessionId);
			const wasDesired = wantsSession(sessionId);
			const counts = retainReasons.get(sessionId) ?? {
				focused: 0,
				running: 0,
				warm: 0,
			};
			counts[reason] += 1;
			retainReasons.set(sessionId, counts);
			const retainCount = counts.focused + counts.running + counts.warm;
			setSessionStream(sessionId, {
				retainCount,
				retention: currentRetention(counts),
				lastAccessedAt: now(),
			});
			if (!wasDesired) seedAndSubscribe(sessionId);

			let released = false;
			return () => {
				if (released) return;
				released = true;
				const current = retainReasons.get(sessionId);
				if (!current) return;
				current[reason] = Math.max(0, current[reason] - 1);
				const nextCount = current.focused + current.running + current.warm;
				if (nextCount > 0) {
					retainReasons.set(sessionId, current);
					setSessionStream(sessionId, {
						retainCount: nextCount,
						retention: currentRetention(current),
						lastAccessedAt: now(),
					});
					return;
				}
				retainReasons.delete(sessionId);
				setSessionStream(sessionId, {
					retainCount: 0,
					retention: "warm",
					lastAccessedAt: now(),
				});
				scheduleWarmExpiry(sessionId);
				enforceWarmLimit();
			};
		},

		async fetchOlderEvents(sessionId, fetchOptions): Promise<void> {
			sessionIdSchema.parse(sessionId);
			const stream =
				store.getState().streamsBySessionId[sessionId] ??
				createEmptyStream(now());
			const beforeCursor = stream.oldestCursor;
			if (beforeCursor !== null && !stream.hasOlder) return;
			const input = getEventsInputSchema.parse({
				sessionId,
				...(beforeCursor === null ? {} : { beforeCursor }),
				limit: fetchOptions?.limit ?? DEFAULT_HISTORY_WINDOW,
			});
			const value = await api.getEvents(input);
			const window = eventsWindowSchema.parse(value);
			if (window.sessionId !== sessionId || window.threadId !== null) {
				throw new Error("session history response identity mismatch");
			}
			// Re-read after the await: live events may have appended while the
			// request was in flight, and replacing then would erase them. A
			// stream that vanished mid-flight (session removed) stays gone.
			const current = store.getState().streamsBySessionId[sessionId];
			if (!current && !wantsSession(sessionId)) return;
			applyWindow(
				sessionId,
				window,
				(current?.eventIds.length ?? 0) === 0 ? "replace" : "prepend",
			);
		},

		registerToolResolver(descriptor) {
			const parsedDescriptor = toolResolverDescriptorSchema.parse(descriptor);
			const key = `${parsedDescriptor.name} ${parsedDescriptor.version}`;
			const existing = resolverCounts.get(key);
			if (existing) {
				existing.count += 1;
			} else {
				resolverCounts.set(key, { descriptor: parsedDescriptor, count: 1 });
				if (isConnected()) {
					send({
						type: "toolResolversChanged",
						requestId: nextRequestId(),
						toolResolvers: activeToolResolvers(),
					});
				}
			}
			let released = false;
			return () => {
				if (released) return;
				released = true;
				const current = resolverCounts.get(key);
				if (!current) return;
				current.count -= 1;
				if (current.count > 0) return;
				resolverCounts.delete(key);
				if (isConnected()) {
					send({
						type: "toolResolversChanged",
						requestId: nextRequestId(),
						toolResolvers: activeToolResolvers(),
					});
				}
			};
		},

		async resolveToolCall(input): Promise<void> {
			toolCallIdSchema.parse(input.toolCallId);
			const toolCall = store.getState().clientToolCallsById[input.toolCallId];
			if (!toolCall) {
				throw new Error(`tool call not available: ${input.toolCallId}`);
			}
			const request = resolveToolCallInputSchema.parse({
				requestId: nextRequestId(),
				sessionId: toolCall.sessionId,
				toolCallId: input.toolCallId,
				outcome: input.outcome,
			});
			await api.resolveToolCall(request);
		},
	};
}
