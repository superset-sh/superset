// Reproduction + regression tests for the tunnel reconnect backoff.
//
// Issue #5147: when `superset start` connects to a relay that the host is
// not authorized for, the relay ACCEPTS the WebSocket upgrade (firing the
// client's `onopen`) and only then closes with `code=1008, reason=Forbidden`.
// Because `onopen` reset the backoff counter, every reconnect was computed
// from attempt 0 (~750ms) and the client hammered the relay in a tight loop,
// forever logging "attempt 1" instead of backing off exponentially.
//
// These tests drive TunnelClient against a fake WebSocket + fake timers so we
// can observe the reconnect cadence deterministically.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { TunnelClient } from "./tunnel-client.ts";

interface FakeTimer {
	cb: () => void;
	delay: number;
}

let sockets: FakeWebSocket[] = [];
let timers: Map<number, FakeTimer>;
let nextTimerId: number;
let logs: string[];

class FakeWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	readyState = FakeWebSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onclose: ((e: { code: number; reason: string }) => void) | null = null;
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	readonly url: string;

	constructor(url: string) {
		this.url = url;
		sockets.push(this);
	}

	send(): void {}

	close(): void {
		this.readyState = FakeWebSocket.CLOSED;
	}

	// Simulate the relay accepting the upgrade then rejecting auth: onopen
	// fires (handshake completed) followed immediately by a 1008 close.
	rejectAfterOpen(code = 1008, reason = "Forbidden"): void {
		this.readyState = FakeWebSocket.OPEN;
		this.onopen?.();
		this.readyState = FakeWebSocket.CLOSED;
		this.onclose?.({ code, reason });
	}
}

// Run all currently-pending reconnect timers (delays are <= the 5s ceiling;
// the 20s connect-deadline timer is filtered out and ignored).
function runReconnectTimers(): void {
	const pending = [...timers.entries()].filter(([, t]) => t.delay <= 5_000);
	for (const [id, t] of pending) {
		timers.delete(id);
		t.cb();
	}
}

// Let the async connect() body (which awaits getAuthToken) settle so the next
// FakeWebSocket is constructed before we inspect it.
async function flush(): Promise<void> {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

function lastAttempt(): number {
	for (let i = logs.length - 1; i >= 0; i--) {
		const m = logs[i]?.match(/attempt (\d+)\)/);
		if (m) return Number(m[1]);
	}
	throw new Error("no reconnect attempt logged");
}

let origSetTimeout: typeof setTimeout;
let origClearTimeout: typeof clearTimeout;
let origSetInterval: typeof setInterval;
let origWebSocket: typeof WebSocket;
let origLog: typeof console.log;
let origWarn: typeof console.warn;

beforeEach(() => {
	sockets = [];
	timers = new Map();
	nextTimerId = 1;
	logs = [];

	origSetTimeout = globalThis.setTimeout;
	origClearTimeout = globalThis.clearTimeout;
	origSetInterval = globalThis.setInterval;
	origWebSocket = globalThis.WebSocket;
	origLog = console.log;
	origWarn = console.warn;

	globalThis.setTimeout = ((cb: () => void, delay = 0) => {
		const id = nextTimerId++;
		timers.set(id, { cb, delay });
		return id;
	}) as unknown as typeof setTimeout;
	globalThis.clearTimeout = ((id: number) => {
		timers.delete(id);
	}) as unknown as typeof clearTimeout;
	// Watchdog uses setInterval — make it a no-op so it never fires in tests.
	globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
	globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
	console.log = mock((msg?: unknown) => {
		logs.push(String(msg));
	});
	console.warn = mock((msg?: unknown) => {
		logs.push(String(msg));
	});
});

afterEach(() => {
	globalThis.setTimeout = origSetTimeout;
	globalThis.clearTimeout = origClearTimeout;
	globalThis.setInterval = origSetInterval;
	globalThis.WebSocket = origWebSocket;
	console.log = origLog;
	console.warn = origWarn;
});

function makeClient(): TunnelClient {
	return new TunnelClient({
		relayUrl: "https://relay.test",
		hostId: "host-1",
		getAuthToken: async () => "token-123",
		localPort: 5000,
		hostServiceSecret: "secret",
	});
}

describe("TunnelClient reconnect backoff", () => {
	test("escalates backoff when the relay accepts then rejects with 1008 (issue #5147)", async () => {
		const client = makeClient();
		void client.connect();
		await flush();

		const attempts: number[] = [];
		for (let cycle = 0; cycle < 4; cycle++) {
			const socket = sockets.at(-1);
			expect(socket).toBeDefined();
			// Relay accepts the WS upgrade then immediately rejects auth.
			socket?.rejectAfterOpen(1008, "Forbidden");
			attempts.push(lastAttempt());
			runReconnectTimers();
			await flush();
		}

		client.close();

		// Each successive rejection must back off further, not reset to 1.
		// On the buggy code these are all 1 (onopen reset the counter), so the
		// strictly-increasing assertion fails — reproducing the tight loop.
		for (let i = 1; i < attempts.length; i++) {
			expect(attempts[i]).toBeGreaterThan(attempts[i - 1] as number);
		}
		expect(attempts.at(-1)).toBeGreaterThan(1);
	});

	test("resets backoff once the relay delivers inbound traffic", async () => {
		const client = makeClient();
		void client.connect();
		await flush();

		// Two reject cycles to push the backoff counter up.
		for (let cycle = 0; cycle < 2; cycle++) {
			sockets.at(-1)?.rejectAfterOpen(1008, "Forbidden");
			runReconnectTimers();
			await flush();
		}
		expect(lastAttempt()).toBeGreaterThan(1);

		// Now the relay genuinely accepts: handshake + an inbound ping frame.
		const good = sockets.at(-1);
		if (!good) throw new Error("no socket created");
		good.readyState = FakeWebSocket.OPEN;
		good.onopen?.();
		good.onmessage?.({ data: JSON.stringify({ type: "ping" }) });

		// A later drop should restart from the base attempt, not the elevated one.
		good.readyState = FakeWebSocket.CLOSED;
		good.onclose?.({ code: 1006, reason: "" });
		expect(lastAttempt()).toBe(1);

		client.close();
	});
});
