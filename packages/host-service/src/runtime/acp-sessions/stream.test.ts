import { afterEach, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type {
	SessionUpdateEnvelope,
	SessionUpdateFrame,
} from "@superset/session-protocol";
import {
	type SessionSubscription,
	subscribeToSession,
} from "@superset/session-protocol/client";
import { Hono } from "hono";
import { AcpSessionNotFoundError } from "./acp-sessions";
import { SessionJournal } from "./journal";
import {
	type AcpSessionStreamSource,
	registerAcpSessionStreamRoute,
} from "./stream";

const SESSION_ID = "stream-test-session";

function textFrame(text: string): SessionUpdateFrame {
	return {
		kind: "update",
		update: {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text },
		},
	};
}

/**
 * Journal-backed stand-in for AcpSessionManager.subscribe with identical
 * semantics: default-live cursor, synchronous replay, reset on eviction.
 */
class StubStreamSource implements AcpSessionStreamSource {
	readonly journal: SessionJournal;
	readonly subscribers = new Set<(envelope: SessionUpdateEnvelope) => void>();

	constructor(capacity = 100) {
		this.journal = new SessionJournal(capacity);
	}

	emit(frame: SessionUpdateFrame): SessionUpdateEnvelope {
		const envelope = this.journal.append(SESSION_ID, frame);
		for (const subscriber of [...this.subscribers]) {
			subscriber(envelope);
		}
		return envelope;
	}

	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	}): () => void {
		if (input.sessionId !== SESSION_ID) {
			throw new AcpSessionNotFoundError(
				`ACP session not found: ${input.sessionId}`,
			);
		}
		const since = input.since ?? this.journal.latestSeq;
		const backlog = this.journal.after(since);
		if (backlog === null) {
			input.onEnvelope({
				seq: this.journal.latestSeq,
				sessionId: SESSION_ID,
				ts: Date.now(),
				frame: { kind: "reset", reason: "journal_evicted" },
			});
			return () => {};
		}
		for (const envelope of backlog) {
			input.onEnvelope(envelope);
		}
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

describe("acp-sessions stream route", () => {
	let server: ServerType | null = null;
	const openSubscriptions: SessionSubscription[] = [];

	async function startServer(source: AcpSessionStreamSource): Promise<string> {
		const app = new Hono();
		const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
		registerAcpSessionStreamRoute({ app, sessions: source, upgradeWebSocket });
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
		onEnvelope?: (envelope: SessionUpdateEnvelope) => void;
		onReset?: (reason: string) => void;
	}): { subscription: SessionSubscription; received: SessionUpdateEnvelope[] } {
		const received: SessionUpdateEnvelope[] = [];
		const subscription = subscribeToSession({
			streamUrl: `${options.baseUrl}/acp-sessions/${options.sessionId ?? SESSION_ID}/stream`,
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
		if (server) {
			const current = server;
			server = null;
			// Sockets the SERVER closed can linger half-accounted in bun's ws
			// compat and wedge a graceful close — force-drop them first.
			(
				current as unknown as { closeAllConnections?: () => void }
			).closeAllConnections?.();
			await new Promise<void>((resolve) => {
				current.close(() => resolve());
			});
		}
	});

	test("replays the tail from `since`, then streams live; concurrent subscribers see identical gapless envelopes", async () => {
		const source = new StubStreamSource();
		source.emit(textFrame("one"));
		source.emit(textFrame("two"));
		source.emit(textFrame("three"));
		const baseUrl = await startServer(source);

		const a = connect({ baseUrl, since: 0 });
		await waitFor(() => a.received.length === 3, 5_000, "A's replay");

		const b = connect({ baseUrl, since: 0 });
		await waitFor(() => b.received.length === 3, 5_000, "B's replay");

		source.emit(textFrame("four"));
		source.emit(textFrame("five"));
		await waitFor(
			() => a.received.length === 5 && b.received.length === 5,
			5_000,
			"live envelopes on both subscribers",
		);

		const seqsOf = (envelopes: SessionUpdateEnvelope[]) =>
			envelopes.map((envelope) => envelope.seq);
		expect(seqsOf(a.received)).toEqual([1, 2, 3, 4, 5]);
		expect(JSON.stringify(a.received)).toBe(JSON.stringify(b.received));
	});

	test("a client that disconnects mid-stream catches up via its cursor with no gaps or duplicates", async () => {
		const source = new StubStreamSource();
		const baseUrl = await startServer(source);

		const first = connect({ baseUrl, since: 0 });
		source.emit(textFrame("one"));
		source.emit(textFrame("two"));
		await waitFor(() => first.received.length === 2, 5_000, "initial stream");
		first.subscription.close();
		await waitFor(
			() => source.subscribers.size === 0,
			5_000,
			"server-side unsubscribe",
		);

		// Missed while offline.
		source.emit(textFrame("three"));
		source.emit(textFrame("four"));

		const second = connect({ baseUrl, since: first.subscription.lastSeq });
		await waitFor(() => second.received.length === 2, 5_000, "catch-up replay");
		source.emit(textFrame("five"));
		await waitFor(() => second.received.length === 3, 5_000, "post-catch-up");

		const combined = [...first.received, ...second.received].map(
			(envelope) => envelope.seq,
		);
		expect(combined).toEqual([1, 2, 3, 4, 5]);
	});

	test("an evicted cursor gets a reset frame and the subscription stops", async () => {
		const source = new StubStreamSource(5);
		for (let i = 0; i < 10; i += 1) {
			source.emit(textFrame(`frame ${i + 1}`));
		}
		const baseUrl = await startServer(source);

		const resets: string[] = [];
		const { received } = connect({
			baseUrl,
			since: 1,
			onReset: (reason) => {
				resets.push(reason);
			},
		});
		await waitFor(() => resets.length > 0, 5_000, "reset frame");
		expect(resets[0]).toBe("journal_evicted");
		// The reset is terminal: nothing was delivered as a normal envelope,
		// and later emissions must not reach the stopped subscription.
		expect(received).toEqual([]);
		source.emit(textFrame("after reset"));
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(received).toEqual([]);
		expect(source.subscribers.size).toBe(0);
	});

	test("an unknown session id gets a session_not_found reset instead of a reconnect loop", async () => {
		const source = new StubStreamSource();
		const baseUrl = await startServer(source);

		const resets: string[] = [];
		connect({
			baseUrl,
			sessionId: "no-such-session",
			since: 0,
			onReset: (reason) => {
				resets.push(reason);
			},
		});
		await waitFor(() => resets.length > 0, 5_000, "reset frame");
		expect(resets[0]).toBe("session_not_found");
	});

	test("a malformed since cursor gets an invalid_since reset", async () => {
		const source = new StubStreamSource();
		const baseUrl = await startServer(source);

		const resets: string[] = [];
		const received: SessionUpdateEnvelope[] = [];
		const subscription = subscribeToSession({
			streamUrl: `${baseUrl}/acp-sessions/${SESSION_ID}/stream?since=banana`,
			onEnvelope: (envelope) => received.push(envelope),
			onReset: (reason) => {
				resets.push(reason);
			},
		});
		openSubscriptions.push(subscription);
		await waitFor(() => resets.length > 0, 5_000, "reset frame");
		expect(resets[0]).toBe("invalid_since");
		expect(received).toEqual([]);
	});

	test("omitting since starts the stream live from now", async () => {
		const source = new StubStreamSource();
		source.emit(textFrame("history"));
		source.emit(textFrame("more history"));
		const baseUrl = await startServer(source);

		const live = connect({ baseUrl });
		await waitFor(() => source.subscribers.size === 1, 5_000, "subscription");
		source.emit(textFrame("live"));
		await waitFor(() => live.received.length === 1, 5_000, "live envelope");
		expect(live.received[0]?.seq).toBe(3);
	});
});
