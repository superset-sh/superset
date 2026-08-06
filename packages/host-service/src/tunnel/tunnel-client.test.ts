import { afterEach, describe, expect, test } from "bun:test";

// Minimal fake WebSocket implementing only what TunnelClient touches.
class FakeWebSocket {
	static OPEN = 1;
	static CONNECTING = 0;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState = FakeWebSocket.CONNECTING;
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

// Registered BEFORE the module import: TunnelClient resolves `WebSocket`
// at module-evaluation time, so the fake must be in place first. Needed
// by the late-messages test, which drives the real connect() path to get
// the guarded handlers; restored in afterEach.
const originalWebSocket = globalThis.WebSocket;
(globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;

const { TunnelClient } = await import("./tunnel-client");

// Tests exercise forceReconnect / socket identity directly rather than the
// watchdog timer (which needs real 10s intervals); the module's other
// constants are not exported, so timers are not driven here.
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
		close: () => void;
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
		client.socket = sock;
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
		client.socket = stale;
		let scheduled = 0;
		(client as unknown as { scheduleReconnect: () => void }).scheduleReconnect =
			() => {
				scheduled++;
			};

		// A newer socket replaced the stale one before the watchdog fired.
		const current = new FakeWebSocket();
		client.socket = current;
		client.forceReconnect(stale, 4002, "Inbound silence timeout");

		// Stale socket must not be torn down or scheduled.
		expect(client.socket).toBe(current);
		expect(scheduled).toBe(0);
		expect(stale.closeCalls).toEqual([]);
	});

	test("forceReconnect is a no-op after close()", () => {
		const client = makeClient();
		const sock = new FakeWebSocket();
		client.socket = sock;
		let scheduled = 0;
		(client as unknown as { scheduleReconnect: () => void }).scheduleReconnect =
			() => {
				scheduled++;
			};
		client.close();

		client.forceReconnect(sock, 4002, "Inbound silence timeout");
		expect(scheduled).toBe(0);
	});

	test("late messages from an orphaned socket are ignored", async () => {
		const client = makeClient();
		// Stub scheduleReconnect so the forceReconnect call below doesn't
		// leave a real reconnect timer that could fire after the test.
		let scheduled = 0;
		(client as unknown as { scheduleReconnect: () => void }).scheduleReconnect =
			() => {
				scheduled++;
			};
		client.lastInboundAt = 1_000;

		// connect() assigns the REAL guarded handlers on the socket.
		await client.connect();
		const stale = client.socket;
		expect(stale?.onmessage).not.toBeNull();
		if (!stale) throw new Error("expected a connected socket");

		// Orphan the socket exactly as the watchdog does.
		client.forceReconnect(stale, 4002, "Inbound silence timeout");
		expect(client.socket).toBeNull();

		// A late inbound from the orphaned socket must not touch state.
		const before = client.lastInboundAt;
		stale?.onmessage?.({ data: "late-frame" });
		expect(client.lastInboundAt).toBe(before);
		// reconnect was scheduled exactly once by forceReconnect.
		expect(scheduled).toBe(1);
	});
});
