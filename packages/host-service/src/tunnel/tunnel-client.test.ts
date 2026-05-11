import { describe, expect, test } from "bun:test";
import { TunnelClient } from "./tunnel-client";

// Mimics Node.js (undici) WebSocket.close, which throws InvalidAccessError
// for any code other than 1000 or 3000-4999. Bun's WebSocket is more lenient,
// so a plain WebSocket cannot reproduce the bug from #4414 under bun:test.
class StrictMockWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	readyState = StrictMockWebSocket.OPEN;
	closeCalls: Array<{ code?: number; reason?: string }> = [];

	close(code?: number, reason?: string): void {
		if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
			throw new DOMException("invalid code", "InvalidAccessError");
		}
		this.closeCalls.push({ code, reason });
		this.readyState = StrictMockWebSocket.CLOSED;
	}
}

function makeClient(): TunnelClient {
	return new TunnelClient({
		relayUrl: "http://relay.test",
		hostId: "host-test",
		getAuthToken: async () => "token",
		localPort: 12345,
		hostServiceSecret: "secret",
	});
}

describe("TunnelClient.cleanupChannels", () => {
	test("does not throw when closing local channels (reproduces #4414)", () => {
		const client = makeClient();
		const channels = (
			client as unknown as { localChannels: Map<string, unknown> }
		).localChannels;
		const ws = new StrictMockWebSocket();
		channels.set("ch1", ws);

		expect(() => {
			(client as unknown as { cleanupChannels: () => void }).cleanupChannels();
		}).not.toThrow();

		// Channel map should be cleared so we don't leak references.
		expect(channels.size).toBe(0);
		// The close call must have used a spec-valid code (1000 or 3000-4999).
		expect(ws.closeCalls.length).toBeGreaterThan(0);
		const code = ws.closeCalls[0]?.code;
		const valid =
			code === undefined || code === 1000 || (code >= 3000 && code <= 4999);
		expect(valid).toBe(true);
	});

	test("tolerates invalid close codes from the relay in handleWsClose", () => {
		const client = makeClient();
		const channels = (
			client as unknown as { localChannels: Map<string, unknown> }
		).localChannels;
		const ws = new StrictMockWebSocket();
		channels.set("ch2", ws);

		// 1006 is "abnormal closure" — set by the protocol, not user-callable.
		// A misbehaving or buggy relay could forward it; we must not crash.
		expect(() => {
			(
				client as unknown as {
					handleWsClose: (msg: {
						type: "ws:close";
						id: string;
						code?: number;
					}) => void;
				}
			).handleWsClose({ type: "ws:close", id: "ch2", code: 1006 });
		}).not.toThrow();
		expect(channels.size).toBe(0);
	});
});
