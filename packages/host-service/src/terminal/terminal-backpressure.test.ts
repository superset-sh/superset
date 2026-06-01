// Reproduction + fix for superset-sh/superset#4868: host-service.js V8 OOM
// under active terminal use. Root cause: broadcastBytes called `ws.send()`
// on every PTY output chunk without ever checking the WebSocket's
// bufferedAmount. A renderer that fell behind drained → underlying `ws`
// queue → V8 heap grew unbounded → V8 aborted at the heap limit.

import { describe, expect, test } from "bun:test";
import {
	BACKPRESSURE_CLOSE_CODE,
	type BackpressureSocket,
	broadcastWithBackpressure,
	isSocketBackpressured,
	MAX_SOCKET_BACKPRESSURE_BYTES,
} from "./terminal-backpressure.ts";

const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;

interface FakeSocketCalls {
	send: number;
	close: number;
	lastCloseCode: number | null;
	lastCloseReason: string | null;
}

interface FakeSocket extends BackpressureSocket {
	calls: FakeSocketCalls;
	raw: { bufferedAmount: number };
}

/**
 * Mock socket whose `send()` queues into `raw.bufferedAmount` (mirroring the
 * `ws` library's behavior) without ever draining — i.e., a stuck consumer.
 * `close()` flips readyState to CLOSED to mirror the real lifecycle.
 */
function makeStuckSocket(): FakeSocket {
	const socket: FakeSocket = {
		readyState: SOCKET_OPEN,
		raw: { bufferedAmount: 0 },
		calls: {
			send: 0,
			close: 0,
			lastCloseCode: null,
			lastCloseReason: null,
		},
		send(data) {
			this.calls.send += 1;
			const length = typeof data === "string" ? data.length : data.byteLength;
			this.raw.bufferedAmount += length;
		},
		close(code, reason) {
			this.calls.close += 1;
			this.calls.lastCloseCode = code ?? null;
			this.calls.lastCloseReason = reason ?? null;
			this.readyState = SOCKET_CLOSED;
		},
	};
	return socket;
}

/**
 * Mock socket whose `send()` drains immediately (bufferedAmount stays 0):
 * a healthy renderer that's keeping up.
 */
function makeHealthySocket(): FakeSocket {
	const socket = makeStuckSocket();
	socket.send = function send(data) {
		this.calls.send += 1;
		// Pretend the bytes flushed to the kernel before we returned.
		void data;
	};
	return socket;
}

function makeChunk(bytes: number): Uint8Array<ArrayBuffer> {
	return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

describe("isSocketBackpressured", () => {
	test("returns false when bufferedAmount is below threshold", () => {
		const socket = makeStuckSocket();
		socket.raw.bufferedAmount = MAX_SOCKET_BACKPRESSURE_BYTES - 1;
		expect(isSocketBackpressured(socket)).toBe(false);
	});

	test("returns true when bufferedAmount exceeds threshold", () => {
		const socket = makeStuckSocket();
		socket.raw.bufferedAmount = MAX_SOCKET_BACKPRESSURE_BYTES + 1;
		expect(isSocketBackpressured(socket)).toBe(true);
	});

	test("returns false when raw is undefined (defensive)", () => {
		const socket: BackpressureSocket = {
			readyState: SOCKET_OPEN,
			send() {},
			close() {},
		};
		expect(isSocketBackpressured(socket)).toBe(false);
	});

	test("honors caller-supplied threshold", () => {
		const socket = makeStuckSocket();
		socket.raw.bufferedAmount = 100;
		expect(isSocketBackpressured(socket, 50)).toBe(true);
		expect(isSocketBackpressured(socket, 200)).toBe(false);
	});
});

describe("broadcastWithBackpressure", () => {
	test("sends to healthy sockets and reports the count", () => {
		const a = makeHealthySocket();
		const b = makeHealthySocket();
		const set = { sockets: new Set<BackpressureSocket>([a, b]) };

		const result = broadcastWithBackpressure(set, makeChunk(1024));

		expect(result).toEqual({ sent: 2, evicted: 0 });
		expect(a.calls.send).toBe(1);
		expect(b.calls.send).toBe(1);
		expect(set.sockets.size).toBe(2);
	});

	// Demonstrates the bug fix: a stuck consumer that would have grown
	// the host-service V8 heap until OOM (issue #4868) is now evicted
	// before bufferedAmount can climb past the threshold.
	test("evicts a stuck consumer once bufferedAmount exceeds the threshold", () => {
		const stuck = makeStuckSocket();
		const set = { sockets: new Set<BackpressureSocket>([stuck]) };

		// Use a small threshold so the test runs quickly. Chunk size mirrors
		// a realistic PTY output burst (~64 KB).
		const threshold = 256 * 1024;
		const chunk = makeChunk(64 * 1024);

		let totalEvicted = 0;
		for (let i = 0; i < 200; i += 1) {
			const result = broadcastWithBackpressure(set, chunk, threshold);
			totalEvicted += result.evicted;
			if (set.sockets.size === 0) break;
		}

		expect(totalEvicted).toBe(1);
		expect(stuck.calls.close).toBe(1);
		expect(stuck.calls.lastCloseCode).toBe(BACKPRESSURE_CLOSE_CODE);
		expect(set.sockets.size).toBe(0);
		// Buffered amount never grew far past the threshold: bounded
		// instead of climbing toward V8's heap limit.
		expect(stuck.raw.bufferedAmount).toBeLessThanOrEqual(
			threshold + chunk.byteLength,
		);
	});

	test("never evicts a healthy consumer no matter how many chunks are sent", () => {
		const healthy = makeHealthySocket();
		const set = { sockets: new Set<BackpressureSocket>([healthy]) };
		const chunk = makeChunk(64 * 1024);

		for (let i = 0; i < 1000; i += 1) {
			broadcastWithBackpressure(set, chunk, 256 * 1024);
		}

		expect(healthy.calls.send).toBe(1000);
		expect(healthy.calls.close).toBe(0);
		expect(set.sockets.size).toBe(1);
	});

	test("evicts only the stuck consumer when both are attached", () => {
		const stuck = makeStuckSocket();
		const healthy = makeHealthySocket();
		const set = { sockets: new Set<BackpressureSocket>([stuck, healthy]) };
		const threshold = 128 * 1024;
		const chunk = makeChunk(64 * 1024);

		for (let i = 0; i < 100; i += 1) {
			broadcastWithBackpressure(set, chunk, threshold);
		}

		expect(stuck.calls.close).toBe(1);
		expect(set.sockets.has(stuck)).toBe(false);
		// Healthy peer keeps receiving every chunk we sent.
		expect(healthy.calls.send).toBe(100);
		expect(set.sockets.has(healthy)).toBe(true);
	});

	test("prunes sockets that are already in CLOSED state", () => {
		const closed = makeStuckSocket();
		closed.readyState = SOCKET_CLOSED;
		const set = { sockets: new Set<BackpressureSocket>([closed]) };

		const result = broadcastWithBackpressure(set, makeChunk(1024));

		expect(result).toEqual({ sent: 0, evicted: 0 });
		expect(closed.calls.send).toBe(0);
		expect(set.sockets.size).toBe(0);
	});
});
