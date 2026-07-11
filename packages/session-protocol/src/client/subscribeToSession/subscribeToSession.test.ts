import { describe, expect, test } from "bun:test";
import type { SessionUpdateEnvelope } from "../../envelope";
import { type StreamStatus, subscribeToSession } from "./subscribeToSession";

class FakeWebSocket {
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	closedByClient = false;

	constructor(url: string) {
		this.url = url;
	}

	close(): void {
		this.closedByClient = true;
	}

	open(): void {
		this.onopen?.();
	}

	message(envelope: SessionUpdateEnvelope): void {
		this.onmessage?.({ data: JSON.stringify(envelope) });
	}

	serverClose(): void {
		this.onclose?.({ code: 1006 });
	}
}

function harness(options?: { since?: number; url?: string }) {
	const sockets: FakeWebSocket[] = [];
	const delivered: SessionUpdateEnvelope[] = [];
	const statuses: StreamStatus[] = [];
	const gaps: Array<{ expected: number; received: number }> = [];
	const resets: string[] = [];
	const subscription = subscribeToSession({
		streamUrl: options?.url ?? "ws://test/stream",
		since: options?.since,
		onEnvelope: (e) => delivered.push(e),
		onStatus: (s) => statuses.push(s),
		onGap: (g) => gaps.push(g),
		onReset: (r) => resets.push(r),
		createWebSocket: (url) => {
			const ws = new FakeWebSocket(url);
			sockets.push(ws);
			return ws;
		},
		reconnectDelayMs: 1,
	});
	return { sockets, delivered, statuses, gaps, resets, subscription };
}

function env(seq: number): SessionUpdateEnvelope {
	return {
		seq,
		sessionId: "sess-1",
		ts: seq,
		frame: {
			kind: "update",
			update: {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: `#${seq}` },
			},
		},
	};
}

function resetEnv(seq: number, reason: string): SessionUpdateEnvelope {
	return {
		seq,
		sessionId: "sess-1",
		ts: seq,
		frame: { kind: "reset", reason },
	};
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("subscribeToSession", () => {
	test("appends since to the url and delivers envelopes in order", () => {
		const h = harness({ since: 10 });
		expect(h.sockets).toHaveLength(1);
		expect(h.sockets[0]?.url).toBe("ws://test/stream?since=10");
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(11));
		h.sockets[0]?.message(env(12));
		expect(h.delivered.map((e) => e.seq)).toEqual([11, 12]);
		expect(h.subscription.lastSeq).toBe(12);
		h.subscription.close();
	});

	test("uses & when the stream url already has a query string", () => {
		const h = harness({ since: 3, url: "ws://test/stream?token=abc" });
		expect(h.sockets[0]?.url).toBe("ws://test/stream?token=abc&since=3");
		h.subscription.close();
	});

	test("drops duplicate envelopes (seq <= lastSeq)", () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(1));
		h.sockets[0]?.message(env(1));
		h.sockets[0]?.message(env(2));
		expect(h.delivered.map((e) => e.seq)).toEqual([1, 2]);
		h.subscription.close();
	});

	test("without since, accepts the first envelope at any seq, then enforces continuity", async () => {
		const h = harness();
		expect(h.sockets[0]?.url).toBe("ws://test/stream");
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(41));
		expect(h.delivered.map((e) => e.seq)).toEqual([41]);
		h.sockets[0]?.message(env(43)); // now a real gap
		expect(h.gaps).toEqual([{ expected: 42, received: 43 }]);
		h.subscription.close();
	});

	test("gap closes the socket and reconnects with since=lastSeq", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(1));
		h.sockets[0]?.message(env(5)); // gap: expected 2
		expect(h.gaps).toEqual([{ expected: 2, received: 5 }]);
		expect(h.sockets[0]?.closedByClient).toBe(true);
		expect(h.delivered.map((e) => e.seq)).toEqual([1]);
		await tick();
		expect(h.sockets).toHaveLength(2);
		expect(h.sockets[1]?.url).toBe("ws://test/stream?since=1");
		h.sockets[1]?.open();
		h.sockets[1]?.message(env(2));
		expect(h.delivered.map((e) => e.seq)).toEqual([1, 2]);
		h.subscription.close();
	});

	test("server close triggers reconnect from the last delivered seq", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(1));
		h.sockets[0]?.serverClose();
		await tick();
		expect(h.sockets).toHaveLength(2);
		expect(h.sockets[1]?.url).toBe("ws://test/stream?since=1");
		expect(h.statuses).toContain("reconnecting");
		h.subscription.close();
	});

	test("reset frame stops the stream and reports the reason; no reconnect", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(1));
		h.sockets[0]?.message(resetEnv(2, "journal_evicted"));
		expect(h.resets).toEqual(["journal_evicted"]);
		expect(h.statuses[h.statuses.length - 1]).toBe("stopped");
		await tick();
		expect(h.sockets).toHaveLength(1);
		h.subscription.close();
	});

	test("user close stops reconnection", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.subscription.close();
		expect(h.sockets[0]?.closedByClient).toBe(true);
		await tick();
		expect(h.sockets).toHaveLength(1);
		expect(h.statuses[h.statuses.length - 1]).toBe("stopped");
	});

	test("async streamUrl factory mints a fresh url on every (re)connect", async () => {
		let minted = 0;
		const sockets: FakeWebSocket[] = [];
		const subscription = subscribeToSession({
			streamUrl: async () => {
				minted += 1;
				return `ws://test/stream?token=t${minted}`;
			},
			since: 0,
			onEnvelope: () => {},
			createWebSocket: (url) => {
				const ws = new FakeWebSocket(url);
				sockets.push(ws);
				return ws;
			},
			reconnectDelayMs: 1,
		});
		await tick();
		expect(sockets[0]?.url).toBe("ws://test/stream?token=t1&since=0");
		sockets[0]?.open();
		sockets[0]?.message(env(1));
		sockets[0]?.serverClose();
		await tick();
		// The reconnect re-invoked the factory (fresh token), not the stale URL.
		expect(sockets[1]?.url).toBe("ws://test/stream?token=t2&since=1");
		subscription.close();
	});

	test("streamUrl factory rejection retries with backoff instead of dying", async () => {
		let calls = 0;
		const sockets: FakeWebSocket[] = [];
		const subscription = subscribeToSession({
			streamUrl: async () => {
				calls += 1;
				if (calls === 1) throw new Error("token mint failed");
				return "ws://test/stream";
			},
			since: 0,
			onEnvelope: () => {},
			createWebSocket: (url) => {
				const ws = new FakeWebSocket(url);
				sockets.push(ws);
				return ws;
			},
			reconnectDelayMs: 1,
		});
		await tick();
		expect(calls).toBeGreaterThanOrEqual(2);
		expect(sockets).toHaveLength(1);
		subscription.close();
	});

	test("malformed frame forces a reconnect from the last good cursor", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(1));
		h.sockets[0]?.onmessage?.({ data: "not json{{{" });
		expect(h.sockets[0]?.closedByClient).toBe(true);
		await tick();
		expect(h.sockets).toHaveLength(2);
		expect(h.sockets[1]?.url).toBe("ws://test/stream?since=1");
		h.subscription.close();
	});

	test("valid JSON that is not an envelope resyncs instead of crashing", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(env(1));
		// A relay/proxy error payload: parses fine, has no seq/frame shape.
		h.sockets[0]?.onmessage?.({ data: JSON.stringify({ error: "bad" }) });
		expect(h.sockets[0]?.closedByClient).toBe(true);
		expect(h.delivered.map((e) => e.seq)).toEqual([1]);
		await tick();
		expect(h.sockets).toHaveLength(2);
		expect(h.sockets[1]?.url).toBe("ws://test/stream?since=1");
		h.subscription.close();
	});

	test("a throwing createWebSocket during reconnect keeps the retry loop alive", async () => {
		let calls = 0;
		const sockets: FakeWebSocket[] = [];
		const subscription = subscribeToSession({
			streamUrl: "ws://test/stream",
			since: 0,
			onEnvelope: () => {},
			createWebSocket: (url) => {
				calls += 1;
				if (calls === 2) throw new Error("socket construction failed");
				const ws = new FakeWebSocket(url);
				sockets.push(ws);
				return ws;
			},
			reconnectDelayMs: 1,
		});
		sockets[0]?.open();
		sockets[0]?.serverClose(); // attempt 2 throws in the reconnect timer
		await tick(20);
		// Attempt 3 recovered instead of the loop dying silently.
		expect(calls).toBeGreaterThanOrEqual(3);
		expect(sockets.length).toBeGreaterThanOrEqual(2);
		subscription.close();
	});
});
