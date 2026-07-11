import { afterEach, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type {
	SDKMessage,
	SessionEventEnvelope,
	SessionEventFrame,
} from "@superset/session-protocol";
import {
	type SessionSubscription,
	subscribeToSession,
} from "@superset/session-protocol/client";
import { Hono } from "hono";
import { SessionJournal } from "./journal";
import { SessionNotFoundError } from "./sessions";
import { registerSessionStreamRoute, type SessionStreamSource } from "./stream";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const MISSING_SESSION_ID = "00000000-0000-4000-8000-000000000002";

function sdkStateMessage(seq: number): SDKMessage {
	return {
		type: "system",
		subtype: "session_state_changed",
		state: seq % 2 === 0 ? "idle" : "running",
		uuid: `message-${seq}`,
		session_id: "claude-stream-test",
	};
}

function sdkFrame(label: string): SessionEventFrame {
	const seq = Number(label.replace(/\D/g, "")) || 1;
	return { kind: "sdk", message: sdkStateMessage(seq) };
}

/** Journal-backed source with the same replay-before-live contract as manager. */
class StubStreamSource implements SessionStreamSource {
	readonly journal: SessionJournal;
	readonly subscribers = new Set<(envelope: SessionEventEnvelope) => void>();

	constructor(capacity = 100) {
		this.journal = new SessionJournal(capacity);
	}

	emit(frame: SessionEventFrame): SessionEventEnvelope {
		const envelope = this.journal.append(SESSION_ID, frame);
		for (const subscriber of [...this.subscribers]) subscriber(envelope);
		return envelope;
	}

	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionEventEnvelope) => void;
	}): () => void {
		if (input.sessionId !== SESSION_ID) {
			throw new SessionNotFoundError(`Session not found: ${input.sessionId}`);
		}

		const since = input.since ?? this.journal.latestSeq;
		const backlog = this.journal.after(since);
		if (backlog === null) {
			input.onEnvelope({
				seq: 0,
				sessionId: SESSION_ID,
				ts: Date.now(),
				frame: {
					kind: "reset",
					reason:
						since > this.journal.latestSeq ? "cursor_ahead" : "journal_evicted",
					latestSeq: this.journal.latestSeq,
				},
			});
			return () => {};
		}

		for (const envelope of backlog) input.onEnvelope(envelope);
		this.subscribers.add(input.onEnvelope);
		return () => {
			this.subscribers.delete(input.onEnvelope);
		};
	}
}

async function waitFor(
	predicate: () => boolean,
	timeoutMs = 5_000,
	label = "condition",
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("sessions stream route", () => {
	let server: ServerType | null = null;
	const openSubscriptions: SessionSubscription[] = [];

	async function startServer(source: SessionStreamSource): Promise<string> {
		const app = new Hono();
		const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
		registerSessionStreamRoute({ app, sessions: source, upgradeWebSocket });
		const started = await new Promise<ServerType>((resolve) => {
			const instance = serve({ fetch: app.fetch, port: 0 }, () =>
				resolve(instance),
			);
		});
		injectWebSocket(started);
		server = started;
		const { port } = started.address() as AddressInfo;
		return `ws://127.0.0.1:${port}`;
	}

	function connect(options: {
		baseUrl: string;
		sessionId?: string;
		since?: number;
		onEnvelope?: (envelope: SessionEventEnvelope) => void;
		onReset?: (reason: string, latestSeq?: number) => void;
	}): { subscription: SessionSubscription; received: SessionEventEnvelope[] } {
		const sessionId = options.sessionId ?? SESSION_ID;
		const received: SessionEventEnvelope[] = [];
		const subscription = subscribeToSession({
			streamUrl: `${options.baseUrl}/sessions/${sessionId}/stream`,
			sessionId,
			since: options.since,
			onEnvelope: (envelope) => {
				received.push(envelope);
				options.onEnvelope?.(envelope);
			},
			onReset: options.onReset,
		});
		openSubscriptions.push(subscription);
		return { subscription, received };
	}

	afterEach(async () => {
		for (const subscription of openSubscriptions.splice(0)) {
			subscription.close();
		}
		if (!server) return;
		const current = server;
		server = null;
		(
			current as unknown as { closeAllConnections?: () => void }
		).closeAllConnections?.();
		await new Promise<void>((resolve) => {
			current.close(() => resolve());
		});
	});

	test("replays from since, then streams identical gapless live envelopes", async () => {
		const source = new StubStreamSource();
		source.emit(sdkFrame("one-1"));
		source.emit(sdkFrame("two-2"));
		source.emit(sdkFrame("three-3"));
		const baseUrl = await startServer(source);

		const first = connect({ baseUrl, since: 0 });
		const second = connect({ baseUrl, since: 0 });
		await waitFor(
			() => first.received.length === 3 && second.received.length === 3,
			5_000,
			"both replays",
		);

		source.emit(sdkFrame("four-4"));
		source.emit(sdkFrame("five-5"));
		await waitFor(
			() => first.received.length === 5 && second.received.length === 5,
			5_000,
			"both live tails",
		);

		expect(first.received.map((envelope) => envelope.seq)).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect(JSON.stringify(first.received)).toBe(
			JSON.stringify(second.received),
		);
	});

	test("reconnect catches up from the last cursor without gaps or duplicates", async () => {
		const source = new StubStreamSource();
		const baseUrl = await startServer(source);
		const first = connect({ baseUrl, since: 0 });

		source.emit(sdkFrame("one-1"));
		source.emit(sdkFrame("two-2"));
		await waitFor(() => first.received.length === 2, 5_000, "initial stream");
		first.subscription.close();
		await waitFor(() => source.subscribers.size === 0, 5_000, "server detach");

		source.emit(sdkFrame("three-3"));
		source.emit(sdkFrame("four-4"));
		const second = connect({ baseUrl, since: first.subscription.lastSeq });
		await waitFor(() => second.received.length === 2, 5_000, "catch-up");
		source.emit(sdkFrame("five-5"));
		await waitFor(() => second.received.length === 3, 5_000, "live tail");

		expect(
			[...first.received, ...second.received].map(({ seq }) => seq),
		).toEqual([1, 2, 3, 4, 5]);
	});

	test("an evicted cursor resets and stops the subscription", async () => {
		const source = new StubStreamSource(5);
		for (let index = 1; index <= 10; index += 1) {
			source.emit(sdkFrame(`frame-${index}`));
		}
		const baseUrl = await startServer(source);
		const resets: Array<{ reason: string; latestSeq?: number }> = [];
		const { received } = connect({
			baseUrl,
			since: 1,
			onReset: (reason, latestSeq) => resets.push({ reason, latestSeq }),
		});

		await waitFor(() => resets.length === 1, 5_000, "eviction reset");
		expect(resets).toEqual([{ reason: "journal_evicted", latestSeq: 10 }]);
		expect(received).toEqual([]);
		source.emit(sdkFrame("frame-11"));
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(received).toEqual([]);
		expect(source.subscribers.size).toBe(0);
	});

	test("a future cursor resets with the current tail and does not reconnect", async () => {
		const source = new StubStreamSource();
		for (let index = 1; index <= 4; index += 1) {
			source.emit(sdkFrame(`frame-${index}`));
		}
		const baseUrl = await startServer(source);
		const resets: Array<{ reason: string; latestSeq?: number }> = [];
		const { received } = connect({
			baseUrl,
			since: 999,
			onReset: (reason, latestSeq) => resets.push({ reason, latestSeq }),
		});

		await waitFor(() => resets.length === 1, 5_000, "future-cursor reset");
		expect(resets).toEqual([{ reason: "cursor_ahead", latestSeq: 4 }]);
		expect(received).toEqual([]);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(source.subscribers.size).toBe(0);
	});

	test("an unknown session gets a terminal session_not_found reset", async () => {
		const source = new StubStreamSource();
		const baseUrl = await startServer(source);
		const resets: string[] = [];
		connect({
			baseUrl,
			sessionId: MISSING_SESSION_ID,
			since: 0,
			onReset: (reason) => resets.push(reason),
		});
		await waitFor(() => resets.length === 1, 5_000, "not-found reset");
		expect(resets).toEqual(["session_not_found"]);
	});

	test("a malformed since cursor gets an invalid_since reset", async () => {
		const source = new StubStreamSource();
		const baseUrl = await startServer(source);
		const resets: string[] = [];
		const subscription = subscribeToSession({
			streamUrl: `${baseUrl}/sessions/${SESSION_ID}/stream?since=banana`,
			sessionId: SESSION_ID,
			onEnvelope: () => {},
			onReset: (reason) => resets.push(reason),
		});
		openSubscriptions.push(subscription);
		await waitFor(() => resets.length === 1, 5_000, "invalid reset");
		expect(resets).toEqual(["invalid_since"]);
	});

	test("omitting since starts live at the current tail", async () => {
		const source = new StubStreamSource();
		source.emit(sdkFrame("history-1"));
		source.emit(sdkFrame("history-2"));
		const baseUrl = await startServer(source);
		const live = connect({ baseUrl });
		await waitFor(
			() => source.subscribers.size === 1,
			5_000,
			"live subscription",
		);
		source.emit(sdkFrame("live-3"));
		await waitFor(() => live.received.length === 1, 5_000, "live frame");
		expect(live.received[0]?.seq).toBe(3);
	});

	test("a WebSocket serialization failure is contained and detaches the stream", async () => {
		const source = new StubStreamSource();
		const baseUrl = await startServer(source);
		connect({ baseUrl, since: 0 });
		await waitFor(
			() => source.subscribers.size === 1,
			5_000,
			"live subscription",
		);

		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const malformedSdkFrame = {
			kind: "sdk",
			message: cyclic,
		} as unknown as SessionEventFrame;
		expect(() => source.emit(malformedSdkFrame)).not.toThrow();
		await waitFor(
			() => source.subscribers.size === 0,
			5_000,
			"failed stream detach",
		);

		// The producer stays usable after one client delivery path fails.
		expect(() => source.emit(sdkFrame("after-failure-2"))).not.toThrow();
	});
});
