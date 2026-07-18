import { describe, expect, test } from "bun:test";
import {
	type EventsWindow,
	type HostSnapshot,
	type Session,
	type SessionEvent,
	type SessionSnapshot,
	type SyncClientPacket,
	syncClientPacketSchema,
	type Thread,
} from "../../protocol";
import type {
	SessionsSyncApi,
	SessionsSyncLogEvent,
	WebSocketLike,
} from "../types";
import { createSessionsSyncClient } from "./createSessionsSyncClient";

const timestamp = 1_783_772_200_000;

class FakeWebSocket implements WebSocketLike {
	readyState = 0;
	bufferedAmount = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose:
		| ((event: { code?: number; reason?: string; wasClean?: boolean }) => void)
		| null = null;
	onerror: ((event: unknown) => void) | null = null;
	readonly sent: string[] = [];
	readonly protocols: string[];
	closeCode: number | null = null;

	constructor(protocols: string[]) {
		this.protocols = protocols;
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(code?: number): void {
		this.closeCode = code ?? 1000;
		this.readyState = 3;
	}

	emitOpen(): void {
		this.readyState = 1;
		this.onopen?.();
	}

	emitMessage(packet: unknown): void {
		this.onmessage?.({ data: JSON.stringify(packet) });
	}

	emitClose(code = 1006): void {
		this.readyState = 3;
		this.onclose?.({ code, wasClean: false });
	}

	packets(): SyncClientPacket[] {
		return this.sent.map((value) =>
			syncClientPacketSchema.parse(JSON.parse(value)),
		);
	}
}

function session(id: string): Session {
	return {
		id,
		workspaceId: "workspace-1",
		title: id,
		mainThreadId: `${id}:main`,
		agent: { id: "claude-code", displayName: "Claude Code" },
		runState: "running",
		capabilities: {
			threadModel: "nested",
			threadFidelity: "partial",
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
		settingOptions: [],
		eventHead: null,
		createdAt: timestamp,
		updatedAt: timestamp,
		lastActivityAt: timestamp,
		archivedAt: null,
		closedAt: null,
		error: null,
	};
}

function mainThread(sessionId: string): Thread {
	return {
		id: `${sessionId}:main`,
		sessionId,
		kind: "main",
		parentThreadId: null,
		origin: { type: "sessionCreated" },
		fidelity: "full",
		title: null,
		runState: "idle",
		eventHead: null,
		createdAt: timestamp,
		updatedAt: timestamp,
		lastActivityAt: timestamp,
	};
}

function hostSnapshotOf(
	sessions: Session[],
	head: string | null = "host-head-1",
	extras?: Partial<
		Pick<HostSnapshot, "pendingPermissions" | "openClientToolCalls">
	>,
): HostSnapshot {
	return {
		sessions,
		pendingPermissions: extras?.pendingPermissions ?? [],
		openClientToolCalls: extras?.openClientToolCalls ?? [],
		head,
	};
}

function sessionSnapshotOf(
	sessionId: string,
	options?: {
		head?: string;
		recentEvents?: SessionEvent[];
		hasOlderEvents?: boolean;
	},
): SessionSnapshot {
	const recentEvents = options?.recentEvents ?? [];
	return {
		session: session(sessionId),
		threads: [mainThread(sessionId)],
		activeTurns: [],
		pendingPermissions: [],
		openToolCalls: [],
		recentEvents,
		hasOlderEvents: options?.hasOlderEvents ?? false,
		head: options?.head ?? recentEvents.at(-1)?.cursor ?? "session-head-0",
	};
}

function emptyWindow(
	sessionId: string,
	head: string,
	hasMoreBefore = false,
): EventsWindow {
	return {
		sessionId,
		threadId: null,
		items: [],
		range: {
			oldest: null,
			newest: null,
			hasMoreBefore,
			truncatedBefore: false,
		},
		head,
	};
}

function helloAck(requestId: string) {
	return {
		type: "helloAck",
		protocolVersion: 1,
		requestId,
		hostId: "host-1",
		connectionId: "connection-1",
		serverTime: timestamp,
		limits: { maxSubscriptions: 32, maxFrameBytes: 1024 * 1024 },
	};
}

function messagePacket(sessionId: string, sequence: number) {
	return {
		type: "event",
		hostId: "host-1",
		subscriptionId: `session:${sessionId}`,
		stream: "session",
		sessionId,
		threadId: `${sessionId}:main`,
		cursor: `cursor-${sequence}`,
		event: {
			id: `event-${sequence}`,
			sessionId,
			threadId: `${sessionId}:main`,
			cursor: `cursor-${sequence}`,
			occurredAt: timestamp + sequence,
			causationId: null,
			payload: {
				type: "messageDelta",
				messageId: "message-1",
				content: { type: "text", text: String(sequence) },
			},
		},
	};
}

function permissionSessionEvent(
	sessionId: string,
	sequence: number,
	payload:
		| { type: "requested"; permissionId: string }
		| { type: "resolved"; permissionId: string },
): SessionEvent {
	return {
		id: `event-${sequence}`,
		sessionId,
		threadId: `${sessionId}:main`,
		cursor: `cursor-${sequence}`,
		occurredAt: timestamp + sequence,
		causationId: null,
		payload:
			payload.type === "requested"
				? {
						type: "permissionRequested",
						permission: {
							id: payload.permissionId,
							sessionId,
							threadId: `${sessionId}:main`,
							toolCallId: "tool-1",
							options: [{ id: "allow", name: "Allow", kind: "allowOnce" }],
							multiSelect: false,
							requestedAt: timestamp + sequence,
						},
					}
				: {
						type: "permissionResolved",
						permissionId: payload.permissionId,
						outcome: { type: "cancelled" },
					},
	};
}

function permissionEventPacket(
	sessionId: string,
	sequence: number,
	payload:
		| { type: "requested"; permissionId: string }
		| { type: "resolved"; permissionId: string },
) {
	const event = permissionSessionEvent(sessionId, sequence, payload);
	return {
		type: "event",
		hostId: "host-1",
		subscriptionId: `session:${sessionId}`,
		stream: "session",
		sessionId,
		threadId: event.threadId,
		cursor: event.cursor,
		event,
	};
}

/**
 * A fully-stubbed sessions API. Every method can be overridden per test.
 * The default host lists session-1/session-2: the client prunes retained
 * sessions the host does not list, so tests that retain must list.
 */
function apiStub(overrides?: Partial<SessionsSyncApi>): SessionsSyncApi {
	return {
		list:
			overrides?.list ??
			(async () =>
				hostSnapshotOf([session("session-1"), session("session-2")])),
		get:
			overrides?.get ?? (async ({ sessionId }) => sessionSnapshotOf(sessionId)),
		getEvents:
			overrides?.getEvents ??
			(async ({ sessionId }) => emptyWindow(sessionId, "history-head")),
		resolveToolCall: overrides?.resolveToolCall ?? (async () => {}),
	};
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("createSessionsSyncClient", () => {
	/** Boots one client; `open()` connects and completes the hello handshake. */
	function bootClient(options?: {
		api?: SessionsSyncApi;
		logs?: SessionsSyncLogEvent[];
		limits?: Partial<
			Parameters<typeof createSessionsSyncClient>[0]["limits"] & object
		>;
		now?: () => number;
		createWebSocket?: (url: string, protocols: string[]) => WebSocketLike;
	}) {
		const sockets: FakeWebSocket[] = [];
		const client = createSessionsSyncClient({
			clientInstanceId: "client-1",
			clientVersion: "1.0.0",
			syncUrl: "ws://host/sessions/sync",
			reconnectDelayMs: 1,
			now: options?.now,
			limits: options?.limits,
			logger: options?.logs
				? { log: (event) => options.logs?.push(event) }
				: undefined,
			createWebSocket:
				options?.createWebSocket ??
				((_url, protocols) => {
					const socket = new FakeWebSocket(protocols);
					sockets.push(socket);
					return socket;
				}),
			api: options?.api ?? apiStub(),
		});
		return {
			client,
			sockets,
			async open() {
				client.connect();
				const socket = sockets[0] as FakeWebSocket;
				socket.emitOpen();
				const hello = socket.packets()[0];
				socket.emitMessage(
					helloAck(hello?.type === "hello" ? hello.requestId : ""),
				);
				await flush();
				return socket;
			},
		};
	}

	test("cold path: tRPC snapshots seed the store, socket resumes every stream", async () => {
		let listCalls = 0;
		const getCalls: string[] = [];
		const harness = bootClient({
			api: apiStub({
				list: async () => {
					listCalls += 1;
					return hostSnapshotOf([session("session-1"), session("session-2")]);
				},
				get: async ({ sessionId }) => {
					getCalls.push(sessionId);
					return sessionSnapshotOf(sessionId, { head: "history-head" });
				},
			}),
		});
		harness.client.retainSession("session-1", "focused");
		harness.client.retainSession("session-2", "running");
		const first = harness.sockets.length
			? (harness.sockets[0] as FakeWebSocket)
			: null;
		expect(first).toBeNull();
		const socket = await harness.open();
		expect(socket.protocols).toEqual(["superset.sessions.sync"]);

		expect(listCalls).toBe(1);
		expect(getCalls.sort()).toEqual(["session-1", "session-2"]);
		expect(
			harness.client.store.getState().sessionsById["session-1"]?.settings
				.activeModel,
		).toBe("anthropic/claude-sonnet-4-6");
		const subscriptions = socket
			.packets()
			.filter((packet) => packet.type === "subscribe");
		expect(subscriptions.map((packet) => packet.subscriptionId).sort()).toEqual(
			["host", "session:session-1", "session:session-2"],
		);
		expect(
			subscriptions.find((packet) => packet.subscriptionId === "host")?.after,
		).toBe("host-head-1");
		expect(
			subscriptions.find(
				(packet) => packet.subscriptionId === "session:session-1",
			)?.after,
		).toBe("history-head");

		socket.emitMessage(messagePacket("session-1", 1));
		expect(
			harness.client.store.getState().streamsBySessionId["session-1"]?.eventIds,
		).toEqual(["event-1"]);

		socket.emitClose();
		await Bun.sleep(5);
		expect(harness.sockets).toHaveLength(2);
		const second = harness.sockets[1] as FakeWebSocket;
		second.emitOpen();
		const reconnectHello = second.packets()[0];
		second.emitMessage(
			helloAck(
				reconnectHello?.type === "hello" ? reconnectHello.requestId : "",
			),
		);
		await flush();

		// Warm reconnect resumes from cursors — no snapshot refetches.
		expect(listCalls).toBe(1);
		expect(getCalls).toHaveLength(2);
		const resumed = second
			.packets()
			.filter((packet) => packet.type === "subscribe");
		expect(resumed).toHaveLength(3);
		expect(
			resumed.find((packet) => packet.subscriptionId === "session:session-1")
				?.after,
		).toBe("cursor-1");
		expect(
			resumed.find((packet) => packet.subscriptionId === "host")?.after,
		).toBe("host-head-1");
		harness.client.disconnect();
	});

	test("a gated-off host (null head) leaves the client idle with no subscriptions", async () => {
		const harness = bootClient({
			api: apiStub({ list: async () => hostSnapshotOf([], null) }),
		});
		const socket = await harness.open();
		expect(harness.client.store.getState().hostSubscription.status).toBe(
			"idle",
		);
		expect(
			socket.packets().filter((packet) => packet.type === "subscribe"),
		).toHaveLength(0);
		harness.client.disconnect();
	});

	test("keeps released sessions warm and logs explicit LRU disposal", () => {
		const logs: SessionsSyncLogEvent[] = [];
		let clock = 0;
		const client = createSessionsSyncClient({
			clientInstanceId: "client-1",
			clientVersion: "1.0.0",
			syncUrl: "ws://unused",
			now: () => ++clock,
			limits: { maxWarmSubscriptions: 1, warmSubscriptionTtlMs: 60_000 },
			logger: { log: (event) => logs.push(event) },
			api: apiStub(),
		});

		client.retainSession("session-1", "focused")();
		client.retainSession("session-2", "focused")();

		expect(
			client.store.getState().streamsBySessionId["session-1"]?.retention,
		).toBe("none");
		expect(
			client.store.getState().streamsBySessionId["session-2"]?.retention,
		).toBe("warm");
		expect(logs).toContainEqual(
			expect.objectContaining({
				event: "sessions_sync.subscription_disposed",
				sessionId: "session-1",
				reason: "warm_lru_eviction",
			}),
		);
		client.disconnect();
	});

	test("reference-counts multiple consumers without duplicating a logical subscription", async () => {
		const getCalls: string[] = [];
		const harness = bootClient({
			api: apiStub({
				get: async ({ sessionId }) => {
					getCalls.push(sessionId);
					return sessionSnapshotOf(sessionId, { head: "head" });
				},
			}),
		});
		const releaseFirst = harness.client.retainSession("session-1", "focused");
		const releaseSecond = harness.client.retainSession("session-1", "focused");
		expect(
			harness.client.store.getState().streamsBySessionId["session-1"]
				?.retainCount,
		).toBe(2);
		const socket = await harness.open();
		expect(getCalls).toEqual(["session-1"]);
		expect(
			socket
				.packets()
				.filter(
					(packet) =>
						packet.type === "subscribe" &&
						packet.subscriptionId === "session:session-1",
				),
		).toHaveLength(1);

		releaseFirst();
		expect(
			harness.client.store.getState().streamsBySessionId["session-1"]
				?.retainCount,
		).toBe(1);
		releaseSecond();
		expect(
			harness.client.store.getState().streamsBySessionId["session-1"]
				?.retention,
		).toBe("warm");
		const releaseThird = harness.client.retainSession("session-1", "focused");
		expect(
			socket
				.packets()
				.filter(
					(packet) =>
						packet.type === "subscribe" &&
						packet.subscriptionId === "session:session-1",
				),
		).toHaveLength(1);
		releaseThird();
		harness.client.disconnect();
	});

	test("bounds retained events and emits structured eviction logs", async () => {
		const logs: SessionsSyncLogEvent[] = [];
		const harness = bootClient({ logs, limits: { maxEventsPerSession: 2 } });
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();
		for (let sequence = 1; sequence <= 3; sequence++) {
			socket.emitMessage(messagePacket("session-1", sequence));
		}

		const stream =
			harness.client.store.getState().streamsBySessionId["session-1"];
		expect(stream?.eventIds).toEqual(["event-2", "event-3"]);
		expect(stream?.hasOlder).toBe(true);
		expect(logs).toContainEqual(
			expect.objectContaining({
				event: "sessions_sync.cache_evicted",
				reason: "session_event_limit",
				eventsDropped: 1,
			}),
		);
		harness.client.disconnect();
	});

	test("publishes resolver capability changes without opening another socket", async () => {
		const harness = bootClient();
		const socket = await harness.open();

		const release = harness.client.registerToolResolver({
			name: "ui.ask_user",
			version: 1,
		});
		expect(harness.sockets).toHaveLength(1);
		expect(socket.packets().at(-1)).toEqual(
			expect.objectContaining({
				type: "toolResolversChanged",
				toolResolvers: [{ name: "ui.ask_user", version: 1 }],
			}),
		);
		release();
		expect(socket.packets().at(-1)).toEqual(
			expect.objectContaining({
				type: "toolResolversChanged",
				toolResolvers: [],
			}),
		);
		harness.client.disconnect();
	});

	test("keeps concurrent permissions and resolves a client tool claimlessly", async () => {
		const resolutions: unknown[] = [];
		const clientTool = {
			id: "tool-client",
			sessionId: "session-1",
			threadId: "session-1:main",
			turnId: "turn-1",
			parentToolCallId: null,
			tool: { name: "ui.ask_user", version: 1 },
			title: "Choose storage",
			input: { question: "Which store?" },
			resolver: {
				type: "client" as const,
				capability: "ui.ask_user",
				routing: "anyCapableClient" as const,
			},
			state: "available" as const,
			createdAt: timestamp,
			updatedAt: timestamp,
			expiresAt: null,
		};
		const permissions = ["permission-1", "permission-2"].map((id) => ({
			id,
			sessionId: "session-1",
			threadId: "session-1:main",
			toolCallId: `tool-${id}`,
			options: [
				{ id: "allow_once", name: "Allow once", kind: "allowOnce" as const },
			],
			multiSelect: false,
			requestedAt: timestamp,
		}));
		const harness = bootClient({
			api: apiStub({
				list: async () =>
					hostSnapshotOf([session("session-1")], "host-head-1", {
						pendingPermissions: permissions,
						openClientToolCalls: [clientTool],
					}),
				resolveToolCall: async (input) => {
					resolutions.push(input);
				},
			}),
		});
		const socket = await harness.open();

		expect(
			Object.keys(harness.client.store.getState().pendingPermissionsById),
		).toEqual(["permission-1", "permission-2"]);
		socket.emitMessage({
			type: "event",
			hostId: "host-1",
			subscriptionId: "host",
			stream: "host",
			sessionId: "session-1",
			threadId: null,
			cursor: "host-cursor-2",
			event: { type: "permissionResolved", permissionId: "permission-1" },
		});
		expect(
			Object.keys(harness.client.store.getState().pendingPermissionsById),
		).toEqual(["permission-2"]);

		// No claim step: any device answers; the host arbitrates first-write-wins.
		await harness.client.resolveToolCall({
			toolCallId: "tool-client",
			outcome: { type: "succeeded", output: { selectedOptionId: "sqlite" } },
		});
		expect(resolutions).toHaveLength(1);
		expect(resolutions[0]).toEqual(
			expect.objectContaining({
				sessionId: "session-1",
				toolCallId: "tool-client",
				outcome: { type: "succeeded", output: { selectedOptionId: "sqlite" } },
			}),
		);
		socket.emitMessage({
			type: "event",
			hostId: "host-1",
			subscriptionId: "host",
			stream: "host",
			sessionId: "session-1",
			threadId: null,
			cursor: "host-cursor-4",
			event: { type: "clientToolCallResolved", toolCallId: "tool-client" },
		});
		expect(
			harness.client.store.getState().clientToolCallsById["tool-client"],
		).toBeUndefined();
		harness.client.disconnect();
	});

	test("closes and logs a frame that fails the canonical runtime schema", () => {
		const logs: SessionsSyncLogEvent[] = [];
		const harness = bootClient({ logs });
		harness.client.connect();
		const socket = harness.sockets[0] as FakeWebSocket;
		socket.emitOpen();
		socket.emitMessage({
			type: "event",
			stream: "session",
			sessionId: "session-1",
			// Deliberately missing every other required field.
		});
		expect(socket.closeCode).toBe(1008);
		expect(logs).toContainEqual(
			expect.objectContaining({
				event: "sessions_sync.socket_dropped",
				reason: "invalid_frame",
			}),
		);
		harness.client.disconnect();
	});

	test("rejects schema-valid packets from the wrong host or logical stream", async () => {
		const invalidPackets = [
			{ ...messagePacket("session-1", 1), hostId: "host-other" },
			{
				...messagePacket("session-1", 1),
				subscriptionId: "session:session-other",
			},
		];
		for (const invalidPacket of invalidPackets) {
			const harness = bootClient();
			const socket = await harness.open();
			socket.emitMessage(invalidPacket);
			expect(socket.closeCode).toBe(1008);
			harness.client.disconnect();
		}
	});

	test("accepts exactly one matching hello acknowledgement per socket", async () => {
		const harness = bootClient();
		harness.client.connect();
		const socket = harness.sockets[0] as FakeWebSocket;
		socket.emitOpen();
		const hello = socket.packets()[0];
		const acknowledgement = helloAck(
			hello?.type === "hello" ? hello.requestId : "",
		);
		socket.emitMessage(acknowledgement);
		expect(harness.client.store.getState().connection.status).toBe("connected");
		socket.emitMessage(acknowledgement);
		expect(socket.closeCode).toBe(1008);
		harness.client.disconnect();
	});

	test("a host reset refetches the list as a replacement set and disposes absent streams", async () => {
		const listResults = [
			hostSnapshotOf([session("session-1")], "host-head-1"),
			hostSnapshotOf([], "host-head-2"),
		];
		let listCalls = 0;
		const harness = bootClient({
			api: apiStub({
				list: async () => {
					const result = listResults[Math.min(listCalls, 1)];
					listCalls += 1;
					return result as HostSnapshot;
				},
			}),
		});
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();
		socket.emitMessage(messagePacket("session-1", 1));
		expect(
			harness.client.store.getState().totalEstimatedEventBytes,
		).toBeGreaterThan(0);

		// The host restarted: our host cursor is foreign, the hub answers reset.
		socket.emitMessage({
			type: "reset",
			subscriptionId: "host",
			stream: "host",
			sessionId: null,
			code: "CURSOR_INVALID",
			recovery: "refetchSnapshot",
		});
		await flush();

		expect(listCalls).toBe(2);
		expect(
			harness.client.store.getState().sessionsById["session-1"],
		).toBeUndefined();
		expect(
			harness.client.store.getState().streamsBySessionId["session-1"],
		).toBeUndefined();
		expect(harness.client.store.getState().totalEstimatedEventBytes).toBe(0);
		expect(
			socket
				.packets()
				.some(
					(packet) =>
						packet.type === "unsubscribe" &&
						packet.subscriptionId === "session:session-1",
				),
		).toBe(true);
		// The new head is subscribed from directly.
		expect(
			socket
				.packets()
				.filter(
					(
						packet,
					): packet is Extract<SyncClientPacket, { type: "subscribe" }> =>
						packet.type === "subscribe" && packet.subscriptionId === "host",
				)
				.map((packet) => packet.after),
		).toEqual(["host-head-1", "host-head-2"]);
		harness.client.disconnect();
	});

	test("a session reset refetches the snapshot before resubscribing", async () => {
		const logs: SessionsSyncLogEvent[] = [];
		let getCalls = 0;
		const harness = bootClient({
			logs,
			api: apiStub({
				get: async ({ sessionId }) => {
					getCalls += 1;
					return sessionSnapshotOf(sessionId, {
						head: `history-head-${getCalls}`,
					});
				},
			}),
		});
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();
		expect(getCalls).toBe(1);

		socket.emitMessage({
			type: "reset",
			subscriptionId: "session:session-1",
			stream: "session",
			sessionId: "session-1",
			code: "CURSOR_EXPIRED",
			recovery: "refetchSnapshot",
		});
		await flush();
		expect(getCalls).toBe(2);
		const sessionSubscriptions = socket
			.packets()
			.filter(
				(packet): packet is Extract<SyncClientPacket, { type: "subscribe" }> =>
					packet.type === "subscribe" &&
					packet.subscriptionId === "session:session-1",
			);
		expect(sessionSubscriptions.map((packet) => packet.after)).toEqual([
			"history-head-1",
			"history-head-2",
		]);
		expect(logs).toContainEqual(
			expect.objectContaining({
				event: "sessions_sync.stream_reset",
				code: "CURSOR_EXPIRED",
			}),
		);
		harness.client.disconnect();
	});

	test("a reset loop trips the circuit breaker and parks the stream in error", async () => {
		const logs: SessionsSyncLogEvent[] = [];
		let getCalls = 0;
		const harness = bootClient({
			logs,
			limits: { maxStreamResetsPerWindow: 2, streamResetWindowMs: 60_000 },
			api: apiStub({
				get: async ({ sessionId }) => {
					getCalls += 1;
					return sessionSnapshotOf(sessionId, { head: `head-${getCalls}` });
				},
			}),
		});
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();
		expect(getCalls).toBe(1);

		const reset = {
			type: "reset",
			subscriptionId: "session:session-1",
			stream: "session",
			sessionId: "session-1",
			code: "CURSOR_INVALID",
			recovery: "refetchSnapshot",
		};
		socket.emitMessage(reset);
		await flush();
		socket.emitMessage(reset);
		await flush();
		expect(getCalls).toBe(3);

		// Third reset inside the window exceeds the budget: park, don't loop.
		socket.emitMessage(reset);
		await flush();
		expect(getCalls).toBe(3);
		const stream =
			harness.client.store.getState().streamsBySessionId["session-1"];
		expect(stream?.status).toBe("error");
		expect(stream?.error).toEqual({ code: "RESET_LOOP", retryable: true });
		expect(logs).toContainEqual(
			expect.objectContaining({
				event: "sessions_sync.reset_loop",
				sessionId: "session-1",
				resets: 3,
			}),
		);
		harness.client.disconnect();
	});

	test("a snapshot refetch resets the cached window instead of splicing a hidden gap", async () => {
		let getCalls = 0;
		const harness = bootClient({
			api: apiStub({
				get: async ({ sessionId }) => {
					getCalls += 1;
					return sessionSnapshotOf(sessionId, {
						head: getCalls === 1 ? "cursor-0" : "cursor-10",
					});
				},
			}),
		});
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();

		socket.emitMessage(messagePacket("session-1", 1));
		socket.emitMessage(messagePacket("session-1", 2));
		expect(
			harness.client.store.getState().streamsBySessionId["session-1"]?.eventIds,
		).toEqual(["event-1", "event-2"]);

		// The stream resets far ahead of the cached window (cursor-10):
		// everything cached is stale and must not splice into the new baseline.
		socket.emitMessage({
			type: "reset",
			subscriptionId: "session:session-1",
			stream: "session",
			sessionId: "session-1",
			code: "CURSOR_EXPIRED",
			recovery: "refetchSnapshot",
		});
		await flush();
		socket.emitMessage(messagePacket("session-1", 11));

		const stream =
			harness.client.store.getState().streamsBySessionId["session-1"];
		expect(stream?.eventIds).toEqual(["event-11"]);
		expect(stream?.latestCursor).toBe("cursor-11");
		// Byte accounting followed the drop: the total equals the one stream.
		expect(harness.client.store.getState().totalEstimatedEventBytes).toBe(
			stream?.estimatedEventBytes ?? -1,
		);
		harness.client.disconnect();
	});

	test("prepended history never resurrects a resolved permission", async () => {
		const request = permissionSessionEvent("session-1", 35, {
			type: "requested",
			permissionId: "perm-old",
		});
		const harness = bootClient({
			api: apiStub({
				get: async ({ sessionId }) =>
					sessionSnapshotOf(sessionId, {
						head: "cursor-50",
						hasOlderEvents: true,
					}),
				getEvents: async ({ sessionId }) => ({
					sessionId,
					threadId: null,
					items: [request],
					range: {
						oldest: {
							eventId: request.id,
							cursor: request.cursor,
							occurredAt: request.occurredAt,
						},
						newest: {
							eventId: request.id,
							cursor: request.cursor,
							occurredAt: request.occurredAt,
						},
						hasMoreBefore: false,
						truncatedBefore: false,
					},
					head: "cursor-60",
				}),
			}),
		});
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();

		// Live: a resolve for a permission whose request predates the window —
		// a no-op fold. The card must not exist before or after paging back.
		socket.emitMessage(
			permissionEventPacket("session-1", 60, {
				type: "resolved",
				permissionId: "perm-old",
			}),
		);
		expect(harness.client.store.getState().pendingPermissionsById).toEqual({});

		await harness.client.fetchOlderEvents("session-1");
		const state = harness.client.store.getState();
		expect(state.pendingPermissionsById).toEqual({});
		// The historical event itself is retained in the log window.
		expect(state.streamsBySessionId["session-1"]?.eventIds).toEqual([
			"event-35",
			"event-60",
		]);
		harness.client.disconnect();
	});

	test("history fetched while live events stream in never erases them or moves the cursor", async () => {
		let resolveOlder: (value: EventsWindow) => void = () => {};
		let getEventsCalls = 0;
		const harness = bootClient({
			api: apiStub({
				get: async ({ sessionId }) =>
					sessionSnapshotOf(sessionId, {
						head: "cursor-5",
						hasOlderEvents: true,
					}),
				getEvents: async () => {
					getEventsCalls += 1;
					return new Promise<EventsWindow>((resolve) => {
						resolveOlder = resolve;
					});
				},
			}),
		});
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();
		expect(
			harness.client.store.getState().streamsBySessionId["session-1"]?.eventIds,
		).toEqual([]);

		const fetching = harness.client.fetchOlderEvents("session-1", {
			limit: 10,
		});
		await flush();
		expect(getEventsCalls).toBe(1);
		socket.emitMessage(messagePacket("session-1", 7));
		resolveOlder(emptyWindow("session-1", "cursor-99"));
		await fetching;

		const stream =
			harness.client.store.getState().streamsBySessionId["session-1"];
		expect(stream?.eventIds).toEqual(["event-7"]);
		// The prepended (empty) page reported the server head cursor-99, but a
		// prepend must never advance the live cursor past what we received.
		expect(stream?.latestCursor).toBe("cursor-7");
		harness.client.disconnect();
	});

	test("a seed resolving after session removal leaves no ghost stream", async () => {
		let resolveSeed: (value: SessionSnapshot) => void = () => {};
		const harness = bootClient({
			api: apiStub({
				get: async () =>
					new Promise<SessionSnapshot>((resolve) => {
						resolveSeed = resolve;
					}),
			}),
		});
		harness.client.retainSession("session-1", "focused");
		const socket = await harness.open();

		// The session disappears while its seed request is in flight.
		socket.emitMessage({
			type: "event",
			hostId: "host-1",
			subscriptionId: "host",
			stream: "host",
			sessionId: "session-1",
			threadId: null,
			cursor: "host-cursor-2",
			event: { type: "sessionRemoved", reason: "archived" },
		});
		resolveSeed(sessionSnapshotOf("session-1", { head: "cursor-9" }));
		await flush();

		expect(
			harness.client.store.getState().streamsBySessionId["session-1"],
		).toBeUndefined();
		expect(harness.client.store.getState().totalEstimatedEventBytes).toBe(0);
		expect(
			harness.sockets[0]
				?.packets()
				.filter(
					(packet) =>
						packet.type === "subscribe" &&
						packet.subscriptionId === "session:session-1",
				),
		).toEqual([]);
		harness.client.disconnect();
	});

	test("session packets for never-subscribed sessions are dropped, not folded and not fatal", async () => {
		const logs: SessionsSyncLogEvent[] = [];
		const harness = bootClient({ logs });
		const socket = await harness.open();

		socket.emitMessage(messagePacket("session-ghost", 1));

		expect(
			harness.client.store.getState().streamsBySessionId["session-ghost"],
		).toBeUndefined();
		// Not connection-fatal: stragglers legitimately race an unsubscribe.
		expect(socket.closeCode).toBeNull();
		expect(logs).toContainEqual({
			event: "sessions_sync.stale_packet_dropped",
			sessionId: "session-ghost",
			packetType: "event",
		});
		harness.client.disconnect();
	});

	test("socket factory failures surface a log event and a connection error", async () => {
		const logs: SessionsSyncLogEvent[] = [];
		const sockets: FakeWebSocket[] = [];
		let attempts = 0;
		const client = createSessionsSyncClient({
			clientInstanceId: "client-1",
			clientVersion: "1.0.0",
			syncUrl: "ws://host/sessions/sync",
			reconnectDelayMs: 1,
			logger: { log: (event) => logs.push(event) },
			createWebSocket: (_url, protocols) => {
				attempts += 1;
				if (attempts === 1) throw new Error("no websocket here");
				const socket = new FakeWebSocket(protocols);
				sockets.push(socket);
				return socket;
			},
			api: apiStub(),
		});
		client.connect();
		expect(logs).toContainEqual({
			event: "sessions_sync.connect_failed",
			reason: "socket_factory_threw",
		});
		expect(client.store.getState().connection.error).toEqual({
			code: "SOCKET_FACTORY_FAILED",
			retryable: true,
		});
		expect(client.store.getState().connection.status).toBe("reconnecting");

		// The retry loop still runs — and succeeds once the factory recovers.
		await Bun.sleep(5);
		expect(sockets).toHaveLength(1);
		client.disconnect();
	});
});
