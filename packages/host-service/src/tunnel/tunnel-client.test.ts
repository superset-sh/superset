import { afterEach, describe, expect, test } from "bun:test";

// Minimal fake WebSocket implementing only what TunnelClient touches.
class FakeWebSocket {
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState = FakeWebSocket.OPEN;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	closeCalls: Array<{ code: number; reason: string }> = [];

	close(code?: number, reason?: string): void {
		this.closeCalls.push({ code: code ?? 1000, reason: reason ?? "" });
		// A blackholed TCP path: the closing handshake never completes, so
		// onclose is NEVER called — the exact #6229 failure.
	}
}

// Stub global WebSocket with the fake.
const originalWebSocket = globalThis.WebSocket;
(globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;

const { TunnelClient } = await import("./tunnel-client");

// Speed up the watchdog for tests: reach into the module via the constants
// is not possible (not exported), so we drive the timer manually by
// stubbing timers.
function makeClient() {
	const client = new TunnelClient({
		relayUrl: "https://relay.example.com",
		hostId: "host-1",
		getAuthToken: async () => "token",
		localPort: 4000,
		hostServiceSecret: "secret",
	});
	return client as unknown as {
		connect: () => Promise<void>;
		socket: FakeWebSocket | null;
		reconnectAttempts: number;
		closed: boolean;
		lastInboundAt: number;
		startWatchdog: () => void;
		stopWatchdog: () => void;
		forceReconnect: (s: FakeWebSocket, code: number, reason: string) => void;
		watchdogTimer: ReturnType<typeof setInterval> | null;
		dispose: () => void;
	};
}

describe("TunnelClient watchdog (#6229)", () => {
	afterEach(() => {
		(globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
	});

	test("forceReconnect schedules a reconnect without waiting for onclose", () => {
		const client = makeClient();
		const sock = new FakeWebSocket();
		// Simulate an established socket
		(client as unknown as { socket: FakeWebSocket }).socket = sock;
		client.reconnectAttempts = 0;

		// Patch scheduleReconnect to observe the call.
		let scheduled = 0;
		(client as unknown as { scheduleReconnect: () => void }).scheduleReconnect =
			() => {
				scheduled++;
			};

		client.forceReconnect(sock, 4002, "Inbound silence timeout");

		expect(sock.closeCalls).toEqual([
			{ code: 4002, reason: "Inbound silence timeout" },
		]);
		// The stale socket is orphaned immediately — onclose (which never
		// fires on a blackholed path) is not the trigger.
		expect(client.socket).toBeNull();
		expect(scheduled).toBe(1);
	});

	test("forceReconnect ignores a stale socket that is no longer current", () => {
		const client = makeClient();
		const stale = new FakeWebSocket();
		(client as unknown as { socket: FakeWebSocket }).socket = stale;
		let scheduled = 0;
		(client as unknown as { scheduleReconnect: () => void }).scheduleReconnect =
			() => {
				scheduled++;
			};

		// A newer socket replaced the stale one before the watchdog fired.
		const current = new FakeWebSocket();
		(client as unknown as { socket: FakeWebSocket }).socket = current;
		client.forceReconnect(stale, 4002, "Inbound silence timeout");

		// Stale socket must not be torn down or scheduled.
		expect(client.socket).toBe(current);
		expect(scheduled).toBe(0);
		expect(stale.closeCalls).toEqual([]);
	});

	test("forceReconnect is a no-op after close()", () => {
		const client = makeClient();
		const sock = new FakeWebSocket();
		(client as unknown as { socket: FakeWebSocket }).socket = sock;
		let scheduled = 0;
		(client as unknown as { scheduleReconnect: () => void }).scheduleReconnect =
			() => {
				scheduled++;
			};
		(client as unknown as { closed: boolean }).closed = true;

		client.forceReconnect(sock, 4002, "Inbound silence timeout");
		expect(scheduled).toBe(0);
	});
});
