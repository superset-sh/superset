import { describe, expect, test } from "bun:test";
import {
	createSessionResultSchema,
	eventsWindowSchema,
	getEventsInputSchema,
	hostSnapshotSchema,
	jsonValueSchema,
	SESSIONS_SYNC_PATH,
	SESSIONS_SYNC_WEBSOCKET_PROTOCOL,
	sessionEventSchema,
	sessionSchema,
	sessionSnapshotSchema,
	syncClientPacketSchema,
	syncErrorCodeSchema,
	syncServerPacketSchema,
	threadSchema,
	toolCallSchema,
	updateSessionInputSchema,
} from "./index";

const now = 1_783_772_200_000;

function session(id = "session-1") {
	return {
		id,
		workspaceId: "workspace-1",
		title: "Reconnect investigation",
		mainThreadId: "thread-main",
		agent: { id: "claude-code", displayName: "Claude Code" },
		runState: "running" as const,
		capabilities: {
			threadModel: "nested" as const,
			threadFidelity: "partial" as const,
			canResume: true,
			supportsPermissions: true,
			supportsModes: true,
			supportsModels: true,
		},
		settings: {
			activeModel: "anthropic/claude-sonnet-4-6",
			activeMode: "default",
			effort: "low",
			configuration: {},
		},
		eventHead: "cursor-10",
		createdAt: now,
		updatedAt: now,
		lastActivityAt: now,
		archivedAt: null,
		closedAt: null,
		error: null,
	};
}

function messageEvent(overrides?: {
	sessionId?: string;
	threadId?: string;
	id?: string;
	cursor?: string;
}) {
	return {
		id: overrides?.id ?? "event-1",
		sessionId: overrides?.sessionId ?? "session-1",
		threadId: overrides?.threadId ?? "thread-main",
		cursor: overrides?.cursor ?? "cursor-1",
		occurredAt: now,
		causationId: null,
		payload: {
			type: "messageDelta" as const,
			messageId: "message-1",
			content: { type: "text" as const, text: "hello" },
		},
	};
}

function clientToolCall(state: "available" | "running" = "available") {
	return {
		id: "tool-1",
		sessionId: "session-1",
		threadId: "thread-main",
		turnId: "turn-1",
		parentToolCallId: null,
		tool: { name: "ui.ask_user", version: 1 },
		title: "Choose storage",
		input: {
			question: "Which store?",
			options: ["sqlite", "files"],
		},
		resolver: {
			type: "client" as const,
			capability: "ui.ask_user",
			routing: "anyCapableClient" as const,
		},
		state,
		createdAt: now,
		updatedAt: now,
		expiresAt: null,
	};
}

function mainThread() {
	return {
		id: "thread-main",
		sessionId: "session-1",
		kind: "main" as const,
		parentThreadId: null,
		origin: { type: "sessionCreated" as const },
		fidelity: "full" as const,
		title: null,
		runState: "idle" as const,
		eventHead: null,
		createdAt: now,
		updatedAt: now,
		lastActivityAt: now,
	};
}

describe("host sessions protocol", () => {
	test("pins the unversioned sync endpoint and stable error codes", () => {
		expect(SESSIONS_SYNC_PATH).toBe("/sessions/sync");
		expect(SESSIONS_SYNC_WEBSOCKET_PROTOCOL).toBe("superset.sessions.sync");
		// No `v1` route/protocol names; versioning lives in the handshake.
		expect(SESSIONS_SYNC_PATH).not.toContain("v1");
		expect(SESSIONS_SYNC_WEBSOCKET_PROTOCOL).not.toContain("v1");
		expect(syncErrorCodeSchema.options).toContain(
			"UNSUPPORTED_PROTOCOL_VERSION",
		);
		expect(syncErrorCodeSchema.options).toContain("OVERLOADED");
	});

	test("parses a host-owned session with authoritative active model", () => {
		const parsed = sessionSchema.parse(session());
		expect(parsed.id).toBe("session-1");
		expect(parsed.settings.activeModel).toBe("anthropic/claude-sonnet-4-6");
		expect("nativeSessionId" in parsed).toBe(false);
	});

	test("requires packet and nested session identity to agree", () => {
		const result = syncServerPacketSchema.safeParse({
			type: "event",
			hostId: "host-1",
			subscriptionId: "host",
			stream: "host",
			sessionId: "session-1",
			threadId: null,
			cursor: "host-cursor-1",
			event: { type: "sessionUpsert", session: session("session-2") },
		});

		expect(result.success).toBe(false);
	});

	test("host snapshot: cross-references and the gated-off empty shape", () => {
		const snapshot = {
			sessions: [session()],
			pendingPermissions: [],
			openClientToolCalls: [clientToolCall()],
			head: "h1-000000000001",
		};
		expect(hostSnapshotSchema.safeParse(snapshot).success).toBe(true);
		// A tool call for an unlisted session cannot appear.
		expect(
			hostSnapshotSchema.safeParse({
				...snapshot,
				openClientToolCalls: [
					{ ...clientToolCall(), sessionId: "session-other" },
				],
			}).success,
		).toBe(false);
		// Host-resolved calls have no business in the client-tool list.
		expect(
			hostSnapshotSchema.safeParse({
				...snapshot,
				openClientToolCalls: [
					{ ...clientToolCall(), resolver: { type: "host" } },
				],
			}).success,
		).toBe(false);
		// Gated-off hosts answer empty with a null head — and nothing else.
		expect(
			hostSnapshotSchema.safeParse({
				sessions: [],
				pendingPermissions: [],
				openClientToolCalls: [],
				head: null,
			}).success,
		).toBe(true);
		expect(
			hostSnapshotSchema.safeParse({ ...snapshot, head: null }).success,
		).toBe(false);
	});

	test("session snapshot: main thread, active turns, and a head-anchored tail", () => {
		const recent = messageEvent({ id: "event-9", cursor: "cursor-9" });
		const snapshot = {
			session: session(),
			threads: [mainThread()],
			activeTurns: [
				{
					id: "turn-1",
					sessionId: "session-1",
					threadId: "thread-main",
					status: "running" as const,
					originatingClientInstanceId: null,
					createdAt: now,
					updatedAt: now,
				},
			],
			pendingPermissions: [],
			openToolCalls: [],
			recentEvents: [recent],
			hasOlderEvents: true,
			head: "cursor-9",
		};
		expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(true);
		// The declared main thread must be present.
		expect(
			sessionSnapshotSchema.safeParse({ ...snapshot, threads: [] }).success,
		).toBe(false);
		// A terminal turn is not an active turn.
		expect(
			sessionSnapshotSchema.safeParse({
				...snapshot,
				activeTurns: [
					{ ...snapshot.activeTurns[0], status: "completed" as const },
				],
			}).success,
		).toBe(false);
		// The recent tail must end exactly at the snapshot head, or subscribing
		// after the head would skip or duplicate events.
		expect(
			sessionSnapshotSchema.safeParse({ ...snapshot, head: "cursor-10" })
				.success,
		).toBe(false);
	});

	test("requires detailed packet, event, and nested thread identity to agree", () => {
		const event = {
			id: "event-1",
			sessionId: "session-1",
			threadId: "thread-main",
			cursor: "cursor-1",
			occurredAt: now,
			causationId: null,
			payload: {
				type: "threadCreated",
				thread: {
					id: "thread-other",
					sessionId: "session-1",
					kind: "subagent",
					parentThreadId: "thread-main",
					origin: {
						type: "subagent",
						spawnedByEventId: "event-spawn",
						spawnedByToolCallId: "tool-spawn",
					},
					fidelity: "partial",
					title: "Audit auth",
					runState: "running",
					eventHead: null,
					createdAt: now,
					updatedAt: now,
					lastActivityAt: now,
				},
			},
		};

		expect(sessionEventSchema.safeParse(event).success).toBe(false);
	});

	test("getEvents is backwards-only: no anchors, no forward paging, capped at 100", () => {
		expect(
			getEventsInputSchema.safeParse({ sessionId: "session-1" }).success,
		).toBe(true);
		expect(
			getEventsInputSchema.safeParse({
				sessionId: "session-1",
				beforeCursor: "cursor-40",
				limit: 100,
			}).success,
		).toBe(true);
		expect(
			getEventsInputSchema.safeParse({ sessionId: "session-1", limit: 101 })
				.success,
		).toBe(false);
		expect(
			getEventsInputSchema.safeParse({
				sessionId: "session-1",
				anchor: { type: "latest" },
			}).success,
		).toBe(true); // unknown keys are stripped, not errors
		const parsed = getEventsInputSchema.parse({
			sessionId: "session-1",
			anchor: { type: "latest" },
		});
		expect("anchor" in parsed).toBe(false);
	});

	test("requires history windows whose boundaries match their items", () => {
		const first = messageEvent({ id: "event-1", cursor: "cursor-1" });
		const last = messageEvent({ id: "event-2", cursor: "cursor-2" });
		const boundary = (event: { id: string; cursor: string }) => ({
			eventId: event.id,
			cursor: event.cursor,
			occurredAt: now,
		});
		const window = eventsWindowSchema.parse({
			sessionId: "session-1",
			threadId: null,
			items: [first, last],
			range: {
				oldest: boundary(first),
				newest: boundary(last),
				hasMoreBefore: true,
				truncatedBefore: false,
			},
			head: "cursor-10",
		});
		expect(window.threadId).toBeNull();
		expect(window.items).toHaveLength(2);
		// Items must belong to the window's session.
		expect(
			eventsWindowSchema.safeParse({
				...window,
				sessionId: "session-other",
			}).success,
		).toBe(false);
		// Boundaries must agree with the first/last items.
		expect(
			eventsWindowSchema.safeParse({
				...window,
				range: { ...window.range, oldest: boundary(last) },
			}).success,
		).toBe(false);
		expect(
			eventsWindowSchema.safeParse({
				...window,
				range: { ...window.range, newest: boundary(first) },
			}).success,
		).toBe(false);
		// An empty window carries no boundaries.
		expect(
			eventsWindowSchema.safeParse({
				...window,
				items: [],
			}).success,
		).toBe(false);
		expect(
			eventsWindowSchema.safeParse({
				sessionId: "session-1",
				threadId: null,
				items: [],
				range: {
					oldest: null,
					newest: null,
					hasMoreBefore: false,
					truncatedBefore: false,
				},
				head: "cursor-10",
			}).success,
		).toBe(true);
		// Truncation means the earlier history is gone — a window cannot both
		// declare the log truncated and promise more pages before it.
		expect(
			eventsWindowSchema.safeParse({
				...window,
				range: {
					...window.range,
					hasMoreBefore: true,
					truncatedBefore: true,
				},
			}).success,
		).toBe(false);
		// A boundary must agree with its item on every field, not just the id —
		// a lying cursor or timestamp corrupts pagination anchors downstream.
		expect(
			eventsWindowSchema.safeParse({
				...window,
				range: {
					...window.range,
					oldest: { ...boundary(first), cursor: "cursor-other" },
				},
			}).success,
		).toBe(false);
		expect(
			eventsWindowSchema.safeParse({
				...window,
				range: {
					...window.range,
					newest: { ...boundary(last), occurredAt: now + 1 },
				},
			}).success,
		).toBe(false);
	});

	test("rejects a turnStarted event that carries a terminal turn status", () => {
		const started = {
			...messageEvent(),
			payload: {
				type: "turnStarted" as const,
				turn: {
					id: "turn-1",
					sessionId: "session-1",
					threadId: "thread-main",
					status: "running" as const,
					originatingClientInstanceId: null,
					createdAt: now,
					updatedAt: now,
				},
			},
		};
		expect(sessionEventSchema.safeParse(started).success).toBe(true);
		expect(
			sessionEventSchema.safeParse({
				...started,
				payload: {
					...started.payload,
					turn: { ...started.payload.turn, status: "completed" as const },
				},
			}).success,
		).toBe(false);
	});

	test("update is one patch mutation: settings accepted, null and no-ops rejected", () => {
		const base = { requestId: "req-1", sessionId: "session-1" };
		expect(
			updateSessionInputSchema.safeParse({ ...base, title: "Renamed" }).success,
		).toBe(true);
		expect(
			updateSessionInputSchema.safeParse({
				...base,
				settings: { activeMode: "plan" },
			}).success,
		).toBe(true);
		// No harness can clear a setting back to unset; accepting null would
		// ack a command the host cannot honor.
		expect(
			updateSessionInputSchema.safeParse({
				...base,
				settings: { activeModel: null },
			}).success,
		).toBe(false);
		// An empty patch is a caller bug, not an idempotent success.
		expect(updateSessionInputSchema.safeParse(base).success).toBe(false);
		expect(
			updateSessionInputSchema.safeParse({ ...base, settings: {} }).success,
		).toBe(false);
	});

	test("rejects a session event packet whose cursor disagrees with its event", () => {
		const event = messageEvent();
		const packet = {
			type: "event" as const,
			hostId: "host-1",
			subscriptionId: "sub-session-1",
			stream: "session" as const,
			sessionId: event.sessionId,
			threadId: event.threadId,
			cursor: event.cursor,
			event,
		};
		expect(syncServerPacketSchema.safeParse(packet).success).toBe(true);
		expect(
			syncServerPacketSchema.safeParse({ ...packet, cursor: "cursor-2" })
				.success,
		).toBe(false);
	});

	test("does not permit a generic or structurally invalid thread", () => {
		const thread = mainThread();
		expect(threadSchema.safeParse(thread).success).toBe(true);
		expect(
			threadSchema.safeParse({
				...thread,
				kind: "subagent",
			}).success,
		).toBe(false);
		expect(
			createSessionResultSchema.safeParse({
				session: session(),
				mainThread: { ...thread, id: "wrong-thread" },
			}).success,
		).toBe(false);
	});

	test("subscribe always carries a cursor — there is no null-cursor snapshot path", () => {
		const subscribe = {
			type: "subscribe",
			requestId: "request-1",
			subscriptionId: "session:session-1",
			stream: { type: "session", sessionId: "session-1" },
			after: "cursor-5",
		};
		expect(syncClientPacketSchema.safeParse(subscribe).success).toBe(true);
		expect(
			syncClientPacketSchema.safeParse({ ...subscribe, after: null }).success,
		).toBe(false);
	});

	test("requires host/session control packet identity to match its stream", () => {
		expect(
			syncServerPacketSchema.safeParse({
				type: "caughtUp",
				subscriptionId: "host",
				stream: "host",
				sessionId: "session-1",
				through: "cursor-1",
			}).success,
		).toBe(false);
		expect(
			syncServerPacketSchema.safeParse({
				type: "reset",
				subscriptionId: "session:session-1",
				stream: "session",
				sessionId: null,
				code: "CURSOR_EXPIRED",
				recovery: "refetchSnapshot",
			}).success,
		).toBe(false);
	});

	test("versions the handshake only and rejects unknown packet variants", () => {
		const hello = {
			type: "hello",
			protocolVersion: 1,
			requestId: "request-1",
			clientInstanceId: "client-1",
			clientVersion: "1.0.0",
			toolResolvers: [],
		};
		expect(syncClientPacketSchema.safeParse(hello).success).toBe(true);
		expect(
			syncClientPacketSchema.safeParse({ ...hello, protocolVersion: 2 })
				.success,
		).toBe(false);
		// Non-handshake packets carry no version field; a stray one is stripped.
		const ping = syncClientPacketSchema.parse({
			type: "ping",
			nonce: "1",
			version: 1,
		});
		expect("version" in ping).toBe(false);
		expect(
			syncClientPacketSchema.safeParse({
				type: "acp_session_update",
			}).success,
		).toBe(false);
	});

	test("bounds recursive JSON extension payloads", () => {
		let withinLimit: unknown = null;
		for (let depth = 0; depth < 64; depth += 1) withinLimit = [withinLimit];
		expect(jsonValueSchema.safeParse(withinLimit).success).toBe(true);
		expect(jsonValueSchema.safeParse([withinLimit]).success).toBe(false);
	});

	test("models a client-resolved question as a normal tool call", () => {
		const parsed = toolCallSchema.parse(clientToolCall());

		expect(parsed.resolver.type).toBe("client");
	});
});
