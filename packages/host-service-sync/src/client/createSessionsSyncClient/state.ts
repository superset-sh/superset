import type {
	HostEventPacket,
	HostSnapshot,
	Session,
	SessionEvent,
	SessionId,
	SessionSnapshot,
} from "../../protocol";
import {
	DEFAULT_SESSIONS_SYNC_LIMITS,
	type SessionStreamState,
	type SessionsSyncLimits,
	type SessionsSyncLogEvent,
	type SessionsSyncState,
} from "../types";

export function createEmptyStream(now: number): SessionStreamState {
	return {
		status: "idle",
		latestCursor: null,
		oldestCursor: null,
		hasOlder: false,
		eventIds: [],
		eventsById: {},
		estimatedEventBytes: 0,
		retainCount: 0,
		retention: "none",
		lastAccessedAt: now,
		error: null,
	};
}

export function createInitialState(): SessionsSyncState {
	return {
		connection: {
			status: "disconnected",
			hostId: null,
			connectionId: null,
			error: null,
		},
		hostSubscription: { status: "idle", latestCursor: null },
		sessionsById: {},
		sessionOrder: [],
		threadsById: {},
		pendingPermissionsById: {},
		clientToolCallsById: {},
		streamsBySessionId: {},
		totalEstimatedEventBytes: 0,
	};
}

export function resolveLimits(
	overrides: Partial<SessionsSyncLimits> | undefined,
): SessionsSyncLimits {
	const limits = { ...DEFAULT_SESSIONS_SYNC_LIMITS, ...overrides };
	for (const [name, value] of Object.entries(limits)) {
		const permitsZero =
			name === "maxWarmSubscriptions" || name === "warmSubscriptionTtlMs";
		if (
			!Number.isSafeInteger(value) ||
			(permitsZero ? value < 0 : value <= 0)
		) {
			throw new Error(`invalid sessions sync limit ${name}: ${value}`);
		}
	}
	return limits;
}

function estimateEventBytes(event: SessionEvent): number {
	// A conservative synchronous approximation that works in browser, React
	// Native, Bun, and Node without requiring Buffer or TextEncoder polyfills.
	return JSON.stringify(event).length * 2;
}

function sessionOrder(sessionsById: Record<string, Session>): SessionId[] {
	return Object.values(sessionsById)
		.sort((left, right) => {
			if (right.lastActivityAt !== left.lastActivityAt) {
				return right.lastActivityAt - left.lastActivityAt;
			}
			return left.id.localeCompare(right.id);
		})
		.map((session) => session.id);
}

function withoutKey<T>(
	record: Record<string, T>,
	key: string,
): Record<string, T> {
	if (!(key in record)) return record;
	const next = { ...record };
	delete next[key];
	return next;
}

function sessionScopedRecord<T extends { id: string; sessionId: string }>(
	items: T[],
): Record<string, T> {
	return Object.fromEntries(items.map((item) => [item.id, item]));
}

/**
 * Folds one session event into session-scoped derived state. This never
 * mutates the Session entity itself: the host stream (tRPC host snapshot +
 * one sessionUpsert per fold) is the sole entity authority, and a seeded or
 * replayed history window can be older than the snapshot entity — folding
 * settings/error/updatedAt from it would regress a fresher entity.
 */
function applySessionProjection(
	state: SessionsSyncState,
	event: SessionEvent,
): Pick<
	SessionsSyncState,
	"threadsById" | "pendingPermissionsById" | "clientToolCallsById"
> {
	let threadsById = state.threadsById;
	let pendingPermissionsById = state.pendingPermissionsById;
	let clientToolCallsById = state.clientToolCallsById;
	const payload = event.payload;

	if (payload.type === "threadCreated" || payload.type === "threadUpdated") {
		threadsById = { ...threadsById, [payload.thread.id]: payload.thread };
	} else if (payload.type === "permissionRequested") {
		pendingPermissionsById = {
			...pendingPermissionsById,
			[payload.permission.id]: payload.permission,
		};
	} else if (payload.type === "permissionResolved") {
		pendingPermissionsById = withoutKey(
			pendingPermissionsById,
			payload.permissionId,
		);
	} else if (payload.type === "toolCallStarted") {
		if (payload.toolCall.resolver.type === "client") {
			clientToolCallsById = {
				...clientToolCallsById,
				[payload.toolCall.id]: payload.toolCall,
			};
		}
	} else if (payload.type === "toolCallUpdated") {
		const existing = clientToolCallsById[payload.toolCallId];
		if (existing) {
			const stateUpdate = payload.update.state;
			if (
				stateUpdate === "succeeded" ||
				stateUpdate === "failed" ||
				stateUpdate === "cancelled"
			) {
				clientToolCallsById = withoutKey(
					clientToolCallsById,
					payload.toolCallId,
				);
			} else {
				clientToolCallsById = {
					...clientToolCallsById,
					[payload.toolCallId]: {
						...existing,
						...(payload.update.title === undefined
							? {}
							: { title: payload.update.title }),
						...(payload.update.input === undefined
							? {}
							: { input: payload.update.input }),
						...(stateUpdate === undefined ? {} : { state: stateUpdate }),
						updatedAt: payload.update.updatedAt,
					},
				};
			}
		}
	}

	return {
		threadsById,
		pendingPermissionsById,
		clientToolCallsById,
	};
}

interface EventMergeResult {
	state: SessionsSyncState;
	logs: SessionsSyncLogEvent[];
}

export function mergeSessionEvents(options: {
	state: SessionsSyncState;
	sessionId: SessionId;
	events: SessionEvent[];
	position: "append" | "prepend" | "replace";
	latestCursor?: string;
	hasMoreBefore?: boolean;
	now: number;
	limits: SessionsSyncLimits;
}): EventMergeResult {
	const {
		state,
		sessionId,
		events,
		position,
		latestCursor,
		hasMoreBefore,
		now,
		limits,
	} = options;
	const previous =
		state.streamsBySessionId[sessionId] ?? createEmptyStream(now);
	let eventIds = position === "replace" ? [] : [...previous.eventIds];
	const eventsById = position === "replace" ? {} : { ...previous.eventsById };
	let estimatedEventBytes =
		position === "replace" ? 0 : previous.estimatedEventBytes;
	const uniqueEvents: SessionEvent[] = [];

	for (const event of events) {
		if (eventsById[event.id]) continue;
		eventsById[event.id] = event;
		estimatedEventBytes += estimateEventBytes(event);
		uniqueEvents.push(event);
	}

	const incomingIds = uniqueEvents.map((event) => event.id);
	eventIds =
		position === "prepend"
			? [...incomingIds, ...eventIds]
			: [...eventIds, ...incomingIds];

	let totalEstimatedEventBytes =
		state.totalEstimatedEventBytes -
		previous.estimatedEventBytes +
		estimatedEventBytes;
	const logs: SessionsSyncLogEvent[] = [];
	let evictedOldEvents = false;

	function dropOldest(
		reason: Extract<
			SessionsSyncLogEvent,
			{ event: "sessions_sync.cache_evicted" }
		>["reason"],
	): void {
		let dropped = 0;
		let freed = 0;
		while (
			eventIds.length > 0 &&
			(eventIds.length > limits.maxEventsPerSession ||
				estimatedEventBytes > limits.maxEstimatedBytesPerSession)
		) {
			const eventId = eventIds.shift();
			if (!eventId) break;
			const event = eventsById[eventId];
			if (!event) continue;
			const size = estimateEventBytes(event);
			freed += size;
			dropped += 1;
			estimatedEventBytes -= size;
			delete eventsById[eventId];
		}
		if (dropped > 0) {
			evictedOldEvents = true;
			totalEstimatedEventBytes -= freed;
			const oldest = eventIds[0];
			logs.push({
				event: "sessions_sync.cache_evicted",
				sessionId,
				reason,
				eventsDropped: dropped,
				estimatedBytesFreed: freed,
				oldestRetainedCursor: oldest
					? (eventsById[oldest]?.cursor ?? null)
					: null,
				totalEstimatedBytesAfter: totalEstimatedEventBytes,
			});
		}
	}

	if (eventIds.length > limits.maxEventsPerSession) {
		dropOldest("session_event_limit");
	}
	if (estimatedEventBytes > limits.maxEstimatedBytesPerSession) {
		dropOldest("session_byte_limit");
	}

	// A prepended history page must never advance the live cursor: its head
	// is the server's head, and adopting it while behind would skip the gap
	// between the last received live event and that head on resubscribe.
	const nextLatestCursor =
		position === "prepend"
			? (previous.latestCursor ?? latestCursor ?? null)
			: (latestCursor ?? uniqueEvents.at(-1)?.cursor ?? previous.latestCursor);

	let nextState: SessionsSyncState = {
		...state,
		streamsBySessionId: {
			...state.streamsBySessionId,
			[sessionId]: {
				...previous,
				latestCursor: nextLatestCursor,
				oldestCursor: eventIds[0]
					? (eventsById[eventIds[0]]?.cursor ?? previous.oldestCursor)
					: previous.oldestCursor,
				hasOlder:
					evictedOldEvents ||
					(hasMoreBefore === undefined ? previous.hasOlder : hasMoreBefore),
				eventIds,
				eventsById,
				estimatedEventBytes,
				lastAccessedAt: now,
			},
		},
		totalEstimatedEventBytes,
	};

	// Fold derived projections from appended live events and replace-seeded
	// windows only. Prepended history is log, not current state: an older
	// page can contain a permissionRequested whose resolve lies in a page
	// never loaded, and folding it would resurrect a settled card.
	if (position !== "prepend") {
		for (const event of uniqueEvents) {
			nextState = { ...nextState, ...applySessionProjection(nextState, event) };
		}
	}

	const totalEvictions = new Map<
		SessionId,
		{ eventsDropped: number; estimatedBytesFreed: number }
	>();
	while (
		nextState.totalEstimatedEventBytes > limits.maxTotalEstimatedEventBytes
	) {
		const candidates = Object.entries(nextState.streamsBySessionId)
			.filter(([, stream]) => stream.eventIds.length > 0)
			.sort(([, left], [, right]) => {
				const leftWeight =
					left.retention === "none" ? 0 : left.retention === "warm" ? 1 : 2;
				const rightWeight =
					right.retention === "none" ? 0 : right.retention === "warm" ? 1 : 2;
				return (
					leftWeight - rightWeight || left.lastAccessedAt - right.lastAccessedAt
				);
			});
		const candidate = candidates[0];
		if (!candidate) break;
		const [candidateSessionId, candidateStream] = candidate;
		const firstId = candidateStream.eventIds[0];
		if (!firstId) break;
		const firstEvent = candidateStream.eventsById[firstId];
		if (!firstEvent) break;
		const size = estimateEventBytes(firstEvent);
		const candidateEvents = { ...candidateStream.eventsById };
		delete candidateEvents[firstId];
		const candidateIds = candidateStream.eventIds.slice(1);
		const nextOldestCursor = candidateIds[0]
			? (candidateEvents[candidateIds[0]]?.cursor ?? null)
			: null;
		nextState = {
			...nextState,
			streamsBySessionId: {
				...nextState.streamsBySessionId,
				[candidateSessionId]: {
					...candidateStream,
					eventIds: candidateIds,
					eventsById: candidateEvents,
					estimatedEventBytes: candidateStream.estimatedEventBytes - size,
					hasOlder: true,
					oldestCursor: nextOldestCursor,
				},
			},
			totalEstimatedEventBytes: nextState.totalEstimatedEventBytes - size,
		};
		const aggregate = totalEvictions.get(candidateSessionId) ?? {
			eventsDropped: 0,
			estimatedBytesFreed: 0,
		};
		aggregate.eventsDropped += 1;
		aggregate.estimatedBytesFreed += size;
		totalEvictions.set(candidateSessionId, aggregate);
	}
	for (const [evictedSessionId, aggregate] of totalEvictions) {
		logs.push({
			event: "sessions_sync.cache_evicted",
			sessionId: evictedSessionId,
			reason: "total_byte_limit",
			eventsDropped: aggregate.eventsDropped,
			estimatedBytesFreed: aggregate.estimatedBytesFreed,
			oldestRetainedCursor:
				nextState.streamsBySessionId[evictedSessionId]?.oldestCursor ?? null,
			totalEstimatedBytesAfter: nextState.totalEstimatedEventBytes,
		});
	}

	return { state: nextState, logs };
}

/**
 * Folds the tRPC `sessions.list` response — the host snapshot. Prunes
 * cached state for sessions the host no longer lists; overlap with host
 * events replayed after the snapshot is harmless because host events are
 * idempotent upserts/removals keyed by entity id.
 */
export function applyHostSnapshot(
	state: SessionsSyncState,
	snapshot: HostSnapshot,
): SessionsSyncState {
	const sessionsById = Object.fromEntries(
		snapshot.sessions.map((session) => [session.id, session]),
	);
	const sessionIds = new Set(Object.keys(sessionsById));
	const threadsById = Object.fromEntries(
		Object.entries(state.threadsById).filter(([, thread]) =>
			sessionIds.has(thread.sessionId),
		),
	);
	const streamsBySessionId = Object.fromEntries(
		Object.entries(state.streamsBySessionId).filter(([sessionId]) =>
			sessionIds.has(sessionId),
		),
	);
	const totalEstimatedEventBytes = Object.values(streamsBySessionId).reduce(
		(total, stream) => total + stream.estimatedEventBytes,
		0,
	);
	return {
		...state,
		hostSubscription: {
			status: snapshot.head === null ? "idle" : "subscribing",
			latestCursor: snapshot.head,
		},
		sessionsById,
		sessionOrder: sessionOrder(sessionsById),
		threadsById,
		pendingPermissionsById: sessionScopedRecord(snapshot.pendingPermissions),
		clientToolCallsById: sessionScopedRecord(snapshot.openClientToolCalls),
		streamsBySessionId,
		totalEstimatedEventBytes,
	};
}

export function applyHostEvent(
	state: SessionsSyncState,
	packet: HostEventPacket,
): SessionsSyncState {
	const event = packet.event;
	let sessionsById = state.sessionsById;
	let threadsById = state.threadsById;
	let pendingPermissionsById = state.pendingPermissionsById;
	let clientToolCallsById = state.clientToolCallsById;
	let streamsBySessionId = state.streamsBySessionId;
	let totalEstimatedEventBytes = state.totalEstimatedEventBytes;

	if (event.type === "sessionUpsert") {
		sessionsById = {
			...sessionsById,
			[event.session.id]: event.session,
		};
	} else if (event.type === "sessionRemoved") {
		sessionsById = withoutKey(sessionsById, packet.sessionId);
		threadsById = Object.fromEntries(
			Object.entries(threadsById).filter(
				([, thread]) => thread.sessionId !== packet.sessionId,
			),
		);
		pendingPermissionsById = Object.fromEntries(
			Object.entries(pendingPermissionsById).filter(
				([, permission]) => permission.sessionId !== packet.sessionId,
			),
		);
		clientToolCallsById = Object.fromEntries(
			Object.entries(clientToolCallsById).filter(
				([, toolCall]) => toolCall.sessionId !== packet.sessionId,
			),
		);
		const stream = streamsBySessionId[packet.sessionId];
		if (stream) {
			totalEstimatedEventBytes -= stream.estimatedEventBytes;
			streamsBySessionId = withoutKey(streamsBySessionId, packet.sessionId);
		}
	} else if (event.type === "permissionAvailable") {
		pendingPermissionsById = {
			...pendingPermissionsById,
			[event.permission.id]: event.permission,
		};
	} else if (event.type === "permissionResolved") {
		pendingPermissionsById = withoutKey(
			pendingPermissionsById,
			event.permissionId,
		);
	} else if (event.type === "clientToolCallAvailable") {
		clientToolCallsById = {
			...clientToolCallsById,
			[event.toolCall.id]: event.toolCall,
		};
	} else if (event.type === "clientToolCallResolved") {
		clientToolCallsById = withoutKey(clientToolCallsById, event.toolCallId);
	}

	return {
		...state,
		hostSubscription: {
			...state.hostSubscription,
			latestCursor: packet.cursor,
		},
		sessionsById,
		sessionOrder: sessionOrder(sessionsById),
		threadsById,
		pendingPermissionsById,
		clientToolCallsById,
		streamsBySessionId,
		totalEstimatedEventBytes,
	};
}

/**
 * Folds the tRPC `sessions.get` response — the session snapshot. The recent
 * tail replaces the cached window entirely: the cache may end anywhere
 * behind the snapshot head, and keeping it would splice a hidden gap
 * between stale events and the live stream that follows.
 */
export function applySessionSnapshot(
	state: SessionsSyncState,
	snapshot: SessionSnapshot,
	now: number,
): SessionsSyncState {
	const sessionId = snapshot.session.id;
	const sessionsById = {
		...state.sessionsById,
		[sessionId]: snapshot.session,
	};
	const threadsById = Object.fromEntries([
		...Object.entries(state.threadsById).filter(
			([, thread]) => thread.sessionId !== sessionId,
		),
		...snapshot.threads.map((thread) => [thread.id, thread] as const),
	]);
	const pendingPermissionsById = Object.fromEntries([
		...Object.entries(state.pendingPermissionsById).filter(
			([, permission]) => permission.sessionId !== sessionId,
		),
		...snapshot.pendingPermissions.map(
			(permission) => [permission.id, permission] as const,
		),
	]);
	const clientToolCallsById = Object.fromEntries([
		...Object.entries(state.clientToolCallsById).filter(
			([, toolCall]) => toolCall.sessionId !== sessionId,
		),
		...snapshot.openToolCalls.map(
			(toolCall) => [toolCall.id, toolCall] as const,
		),
	]);
	const existing =
		state.streamsBySessionId[sessionId] ?? createEmptyStream(now);
	const eventsById = Object.fromEntries(
		snapshot.recentEvents.map((event) => [event.id, event] as const),
	);
	const eventIds = snapshot.recentEvents.map((event) => event.id);
	const estimatedEventBytes = snapshot.recentEvents.reduce(
		(total, event) => total + estimateEventBytes(event),
		0,
	);
	return {
		...state,
		sessionsById,
		sessionOrder: sessionOrder(sessionsById),
		threadsById,
		pendingPermissionsById,
		clientToolCallsById,
		streamsBySessionId: {
			...state.streamsBySessionId,
			[sessionId]: {
				...existing,
				status: "subscribing",
				latestCursor: snapshot.head,
				eventIds,
				eventsById,
				estimatedEventBytes,
				oldestCursor: snapshot.recentEvents[0]?.cursor ?? null,
				hasOlder: snapshot.hasOlderEvents,
				lastAccessedAt: now,
				error: null,
			},
		},
		totalEstimatedEventBytes:
			state.totalEstimatedEventBytes -
			existing.estimatedEventBytes +
			estimatedEventBytes,
	};
}
