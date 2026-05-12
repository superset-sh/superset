// Byte-fidelity canary for the daemon ↔ host wire.
//
// The motivating bug for protocol v2 was an encoding hop in the receive
// path that mangled bytes at chunk boundaries. The structural unit tests
// catch the obvious shape mistakes; this is the runtime canary that fails
// the *moment* anyone reintroduces a hop, regardless of where:
//
//   - `chunk.toString("utf8")` per chunk (random bytes include sequences
//     that aren't valid UTF-8 → U+FFFD replacement → hash mismatch)
//   - base64-in-JSON for output bytes (would still byte-preserve, but the
//     wire bytes go through JSON.parse + Buffer.from(.., "base64") instead
//     of riding the binary tail; the structural shape tests catch that)
//   - any silent split/truncate at any size threshold
//
// Runs under Node (`node --experimental-strip-types --test`).

import { strict as assert } from "node:assert";
import * as crypto from "node:crypto";
import type * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import type {
	Pty,
	PtyOnData,
	PtyOnExit,
	SpawnOptions,
} from "../src/Pty/index.ts";
import { encodeFrame } from "../src/protocol/index.ts";
import { Server } from "../src/Server/index.ts";
import {
	connectAndHello,
	type DaemonClient,
	payloadOf,
} from "./helpers/client.ts";

const sockPath = path.join(os.tmpdir(), `pty-daemon-bytes-${process.pid}.sock`);

/**
 * A driveable fake PTY: the test calls `emit(bytes)` whenever it wants the
 * "shell" to produce output. Lets us inject arbitrary byte sequences without
 * a real shell or PTY's cooked-mode quirks (echo, line discipline, CRLF).
 */
interface DriveablePty extends Pty {
	writes: Buffer[];
	emit(bytes: Uint8Array): void;
	finish(code: number): void;
}

let nextPid = 5000;
let lastSpawned: DriveablePty | null = null;

function makeDriveablePty(meta: SpawnOptions["meta"]): DriveablePty {
	const onDataCbs: PtyOnData[] = [];
	const onExitCbs: PtyOnExit[] = [];
	const pid = nextPid++;
	const pty = {
		pid,
		meta,
		writes: [] as Buffer[],
		write: (data: Buffer) => {
			pty.writes.push(Buffer.from(data));
		},
		resize: () => {},
		kill: () => {},
		getMasterFd: () => -1,
		onData: (cb: PtyOnData) => {
			onDataCbs.push(cb);
		},
		onExit: (cb: PtyOnExit) => {
			onExitCbs.push(cb);
		},
		emit: (bytes: Uint8Array) => {
			for (const cb of onDataCbs) cb(Buffer.from(bytes));
		},
		finish: (code: number) => {
			for (const cb of onExitCbs) cb({ code, signal: null });
		},
	} satisfies DriveablePty;
	return pty;
}

let server: Server;

before(async () => {
	server = new Server({
		socketPath: sockPath,
		daemonVersion: "0.0.0-bytes",
		// Must be larger than any single replay payload in the tests below;
		// otherwise the ring buffer trims prefix bytes and the hash diverges.
		bufferCap: 256 * 1024,
		spawnPty: ({ meta }) => {
			const pty = makeDriveablePty(meta);
			lastSpawned = pty;
			return pty;
		},
	});
	await server.listen();
});

after(async () => {
	await server.close();
});

const META = {
	shell: "/bin/sh",
	argv: [] as string[],
	cols: 80,
	rows: 24,
};

/** Yield random byte chunks summing to `total` bytes, each at most `maxChunk`. */
function* randomChunks(total: number, maxChunk: number): Generator<Buffer> {
	let remaining = total;
	while (remaining > 0) {
		const size = Math.min(remaining, 1 + Math.floor(Math.random() * maxChunk));
		yield crypto.randomBytes(size);
		remaining -= size;
	}
}

function sha256(...buffers: Uint8Array[]): string {
	const h = crypto.createHash("sha256");
	for (const b of buffers) h.update(b);
	return h.digest("hex");
}

/**
 * Subscribe sends no ack on success. To make sure the subscribe has been
 * processed before we start injecting bytes, send a `list` and wait for
 * its reply — the daemon dispatches in order, so list-reply implies the
 * preceding subscribe is live.
 */
async function subscribeAndDrain(
	c: DaemonClient,
	id: string,
	replay: boolean,
): Promise<void> {
	const listReply = c.waitForNext((m) => m.type === "list-reply", 1000);
	c.send({ type: "subscribe", id, replay });
	c.send({ type: "list" });
	await listReply;
}

async function waitForBytes(
	c: DaemonClient,
	id: string,
	target: number,
	ms: number,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < ms) {
		let got = 0;
		for (const m of c.messages) {
			if (m.type === "output" && m.id === id) {
				const p = payloadOf(m);
				if (p) got += p.byteLength;
			}
		}
		if (got >= target) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error(`waitForBytes(${id}): only got <${target} bytes in ${ms}ms`);
}

async function waitForOutputCount(
	c: DaemonClient,
	target: number,
	ms: number,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < ms) {
		const got = c.messages.filter((m) => m.type === "output").length;
		if (got >= target) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error(`waitForOutputCount: only got <${target} frames in ${ms}ms`);
}

async function waitForWrittenBytes(
	pty: DriveablePty,
	target: number,
	ms: number,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < ms) {
		const got = pty.writes.reduce((n, b) => n + b.byteLength, 0);
		if (got >= target) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error(`waitForWrittenBytes: only got <${target} bytes in ${ms}ms`);
}

function collectPayloads(c: DaemonClient, id: string): Uint8Array[] {
	const out: Uint8Array[] = [];
	for (const m of c.messages) {
		if (m.type === "output" && m.id === id) {
			const p = payloadOf(m);
			if (p) out.push(p);
		}
	}
	return out;
}

function concatBytes(buffers: Uint8Array[]): Buffer {
	return Buffer.concat(buffers.map((b) => Buffer.from(b)));
}

function payloadHashes(c: DaemonClient, id: string): string[] {
	return collectPayloads(c, id).map((payload) => sha256(payload));
}

interface ServerConnForTest {
	socket: net.Socket;
	subscriptions: Set<string>;
}

function serverConnsForTest(server: Server): Set<ServerConnForTest> {
	return (server as unknown as { conns: Set<ServerConnForTest> }).conns;
}

function installBufferedWrite(socket: net.Socket): void {
	let writableLength = 0;
	Object.defineProperty(socket, "writableLength", {
		configurable: true,
		get: () => writableLength,
	});
	const fakeWrite = ((
		chunk: string | Uint8Array,
		encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
		callback?: (err?: Error) => void,
	): boolean => {
		writableLength +=
			typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
		if (typeof encodingOrCallback === "function") {
			encodingOrCallback();
		} else {
			callback?.();
		}
		return true;
	}) as net.Socket["write"];
	socket.write = fakeWrite;
}

async function waitForClientClose(c: DaemonClient, ms: number): Promise<void> {
	if (c.closed()) return;
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(new Error(`client did not close within ${ms}ms`));
		}, ms);
		c.onClose(() => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		});
	});
}

async function waitForPayloadHash(
	c: DaemonClient,
	id: string,
	expectedHash: string,
	ms: number,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < ms) {
		if (payloadHashes(c, id).includes(expectedHash)) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	throw new Error(`waitForPayloadHash(${id}): hash not seen within ${ms}ms`);
}

async function openDriveablePty(
	c: DaemonClient,
	id: string,
): Promise<DriveablePty> {
	lastSpawned = null;
	c.send({ type: "open", id, meta: META });
	await c.waitFor((m) => m.type === "open-ok" && m.id === id);
	const spawned = lastSpawned;
	assert.ok(spawned, "spawnPty hook must have fired");
	return spawned;
}

test("live stream: random bytes survive daemon → host byte-perfect", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fid-live";
	let spawned: DriveablePty | null = null;
	try {
		spawned = await openDriveablePty(c, id);
		await subscribeAndDrain(c, id, false);

		// 64 KB of random bytes, varied chunk sizes that include 1-byte and 4 KB
		// chunks so any per-chunk encoding bug has many opportunities to break.
		const chunks = [...randomChunks(64 * 1024, 4096)];
		for (const chunk of chunks) {
			spawned.emit(chunk);
		}
		const sentHash = sha256(...chunks);
		const sentLen = chunks.reduce((n, c) => n + c.byteLength, 0);

		await waitForBytes(c, id, sentLen, 3000);

		const received = collectPayloads(c, id);
		const receivedLen = received.reduce((n, b) => n + b.byteLength, 0);
		assert.equal(receivedLen, sentLen, "received total length must match sent");
		assert.equal(
			sha256(...received),
			sentHash,
			"received bytes must hash-match sent",
		);
	} finally {
		c.send({ type: "close", id });
		spawned?.finish(0);
		await c.close();
	}
});

test("input stream: random bytes survive host → daemon → PTY byte-perfect", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fid-input";
	let spawned: DriveablePty | null = null;
	try {
		spawned = await openDriveablePty(c, id);

		const chunks = [...randomChunks(64 * 1024, 4096)];
		for (const chunk of chunks) {
			c.send({ type: "input", id }, chunk);
		}
		const sent = concatBytes(chunks);
		await waitForWrittenBytes(spawned, sent.byteLength, 3000);

		assert.equal(
			spawned.writes.length,
			chunks.length,
			"one PTY write per input frame",
		);
		const received = concatBytes(spawned.writes);
		assert.equal(received.byteLength, sent.byteLength);
		assert.equal(sha256(received), sha256(sent));
	} finally {
		c.send({ type: "close", id });
		spawned?.finish(0);
		await c.close();
	}
});

test("input frame split across TCP chunks preserves binary payload", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fid-input-split";
	let spawned: DriveablePty | null = null;
	try {
		spawned = await openDriveablePty(c, id);

		const payload = crypto.randomBytes(96 * 1024);
		const frame = encodeFrame({ type: "input", id }, payload);
		const sizes = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
		let offset = 0;
		let i = 0;
		while (offset < frame.byteLength) {
			const size = sizes[i % sizes.length] ?? 1;
			c.sendRaw(
				frame.subarray(offset, Math.min(frame.byteLength, offset + size)),
			);
			offset += size;
			i++;
		}

		await waitForWrittenBytes(spawned, payload.byteLength, 3000);
		assert.equal(
			spawned.writes.length,
			1,
			"split TCP chunks still form one input frame",
		);
		assert.equal(sha256(spawned.writes[0] ?? Buffer.alloc(0)), sha256(payload));
	} finally {
		c.send({ type: "close", id });
		spawned?.finish(0);
		await c.close();
	}
});

test("multi-client multi-session output fan-out preserves stream isolation", async () => {
	const owner = await connectAndHello(sockPath);
	const clients = {
		alpha: await connectAndHello(sockPath),
		beta: await connectAndHello(sockPath),
		gamma: await connectAndHello(sockPath),
	};
	const clientEntries = Object.entries(clients);
	const sessions: Array<{
		id: string;
		pty: DriveablePty;
		payload: Buffer;
	}> = [];

	try {
		for (let i = 0; i < 3; i++) {
			const id = `fid-fanout-${i}`;
			const spawned = await openDriveablePty(owner, id);
			sessions.push({
				id,
				pty: spawned,
				payload: Buffer.concat([
					Buffer.from(`stream:${id}:`, "utf8"),
					crypto.randomBytes(8192 + i * 257),
				]),
			});
		}

		const [s0, s1, s2] = sessions;
		assert.ok(s0 && s1 && s2);
		const subscriptionPlan = new Map<DaemonClient, Set<string>>([
			[clients.alpha, new Set([s0.id, s1.id])],
			[clients.beta, new Set([s1.id, s2.id])],
			[clients.gamma, new Set([s0.id, s2.id])],
		]);

		for (const [client, subscribedIds] of subscriptionPlan) {
			const listReply = client.waitForNext(
				(m) => m.type === "list-reply",
				1000,
			);
			for (const id of subscribedIds) {
				client.send({ type: "subscribe", id, replay: false });
			}
			client.send({ type: "list" });
			await listReply;
		}

		for (const session of sessions) {
			session.pty.emit(session.payload);
		}

		await Promise.all(
			[...subscriptionPlan].map(([client, subscribedIds]) =>
				waitForOutputCount(client, subscribedIds.size, 3000),
			),
		);
		await new Promise((r) => setTimeout(r, 50));

		for (const [clientName, client] of clientEntries) {
			const subscribedIds = subscriptionPlan.get(client);
			assert.ok(subscribedIds, `${clientName} should have a subscription plan`);
			for (const session of sessions) {
				const hashes = payloadHashes(client, session.id);
				const expected: string[] = subscribedIds.has(session.id)
					? [sha256(session.payload)]
					: [];
				assert.deepEqual(
					hashes,
					expected,
					`${clientName} received unexpected payloads for ${session.id}`,
				);
			}
		}
	} finally {
		for (const session of sessions) {
			owner.send({ type: "close", id: session.id });
			session.pty.finish(0);
		}
		await Promise.all([
			owner.close(),
			...Object.values(clients).map((client) => client.close()),
		]);
	}
});

test("slow subscriber is dropped while other subscribers keep streaming", async () => {
	const localSockPath = path.join(
		os.tmpdir(),
		`pty-daemon-slow-subscriber-${process.pid}.sock`,
	);
	const localServer = new Server({
		socketPath: localSockPath,
		daemonVersion: "0.0.0-slow-subscriber",
		bufferCap: 256 * 1024,
		outboundBufferCap: 1024,
		spawnPty: ({ meta }) => {
			const pty = makeDriveablePty(meta);
			lastSpawned = pty;
			return pty;
		},
	});
	await localServer.listen();

	const owner = await connectAndHello(localSockPath);
	const slow = await connectAndHello(localSockPath);
	const fast = await connectAndHello(localSockPath);
	const id = "fid-slow-subscriber";
	let spawned: DriveablePty | null = null;

	try {
		spawned = await openDriveablePty(owner, id);

		await subscribeAndDrain(slow, id, false);
		const slowConn = [...serverConnsForTest(localServer)].find((conn) =>
			conn.subscriptions.has(id),
		);
		assert.ok(slowConn, "slow subscriber conn must be registered");
		installBufferedWrite(slowConn.socket);

		await subscribeAndDrain(fast, id, false);
		const slowClosed = waitForClientClose(slow, 2000);
		spawned.emit(crypto.randomBytes(4096));
		await slowClosed;

		const marker = Buffer.concat([
			Buffer.from("after-slow-drop:", "utf8"),
			crypto.randomBytes(4096),
		]);
		spawned.emit(marker);
		await waitForPayloadHash(fast, id, sha256(marker), 2000);
	} finally {
		owner.send({ type: "close", id });
		spawned?.finish(0);
		await Promise.all([owner.close(), slow.close(), fast.close()]);
		await localServer.close();
	}
});

test("multiple clients can concurrently stream binary input into one PTY", async () => {
	const owner = await connectAndHello(sockPath);
	const writers = await Promise.all(
		Array.from({ length: 4 }, () => connectAndHello(sockPath)),
	);
	const id = "fid-input-multi-writer";
	let spawned: DriveablePty | null = null;

	try {
		spawned = await openDriveablePty(owner, id);

		const framesByWriter = writers.map((_, writerIndex) =>
			Array.from({ length: 24 }, (_, frameIndex) =>
				Buffer.concat([
					Buffer.from(`writer:${writerIndex}:frame:${frameIndex}:`, "utf8"),
					crypto.randomBytes(32 + writerIndex * 7 + frameIndex),
				]),
			),
		);
		const allFrames = framesByWriter.flat();
		const expectedHashes = allFrames.map((frame) => sha256(frame));
		const totalBytes = allFrames.reduce((n, frame) => n + frame.byteLength, 0);

		await Promise.all(
			writers.map(async (writer, writerIndex) => {
				const frames = framesByWriter[writerIndex] ?? [];
				for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
					const frame = frames[frameIndex];
					assert.ok(frame);
					writer.send({ type: "input", id }, frame);
					if (frameIndex % 3 === 0) {
						await new Promise<void>((resolve) => setImmediate(resolve));
					}
				}
			}),
		);

		await waitForWrittenBytes(spawned, totalBytes, 5000);
		await new Promise((r) => setTimeout(r, 50));

		assert.equal(
			spawned.writes.length,
			allFrames.length,
			"one PTY write per input frame across all clients",
		);
		const actualHashes = spawned.writes.map((write) => sha256(write));
		assert.deepEqual(
			[...actualHashes].sort(),
			[...expectedHashes].sort(),
			"every writer frame should arrive exactly once and byte-perfect",
		);

		for (const frames of framesByWriter) {
			let previousIndex = -1;
			for (const frame of frames) {
				const index = actualHashes.indexOf(sha256(frame));
				assert.ok(index > previousIndex, "per-client input order must hold");
				previousIndex = index;
			}
		}
	} finally {
		owner.send({ type: "close", id });
		spawned?.finish(0);
		await Promise.all([
			owner.close(),
			...writers.map((writer) => writer.close()),
		]);
	}
});

test("replay: random bytes from ring buffer survive byte-perfect", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fid-replay";
	let spawned: DriveablePty | null = null;
	try {
		spawned = await openDriveablePty(c, id);

		// Emit BEFORE subscribing so bytes accumulate in the daemon's ring buffer.
		const chunks = [...randomChunks(32 * 1024, 2048)];
		for (const chunk of chunks) {
			spawned.emit(chunk);
		}
		const sentHash = sha256(...chunks);

		// Subscribe with replay → one big concatenated output frame.
		c.send({ type: "subscribe", id, replay: true });
		const replayMsg = await c.waitFor(
			(m) => m.type === "output" && m.id === id,
			2000,
		);
		const replayBytes = payloadOf(replayMsg);
		assert.ok(replayBytes, "replay frame must carry a binary payload");
		assert.equal(
			sha256(replayBytes),
			sentHash,
			"replayed bytes must hash-match what the store accumulated",
		);
	} finally {
		c.send({ type: "close", id });
		spawned?.finish(0);
		await c.close();
	}
});

test("non-UTF-8 byte sequences survive (the regression class)", async () => {
	// The original bug ate bytes that weren't valid UTF-8 when split across
	// chunks. Hand-craft a payload of explicitly-invalid sequences and split
	// each one byte-by-byte to maximize the boundary-mangling surface.
	const c = await connectAndHello(sockPath);
	const id = "fid-non-utf8";
	let spawned: DriveablePty | null = null;
	try {
		spawned = await openDriveablePty(c, id);
		await subscribeAndDrain(c, id, false);

		const sequences = [
			Buffer.from([0xc0, 0x80]), // overlong null encoding
			Buffer.from([0xff, 0xfe]), // BOM-like, invalid as utf-8 start
			Buffer.from([0x80, 0x80, 0x80]), // lone continuation bytes
			Buffer.from([0xed, 0xa0, 0x80]), // surrogate encoded as 3-byte (invalid)
			Buffer.from("🙂", "utf8"), // valid 4-byte, split mid-codepoint below
		];
		for (const s of sequences) {
			// Single-byte chunks: maximal boundary surface. Any per-chunk decode
			// in the relay would replace these with U+FFFD and the hash diverges.
			for (let i = 0; i < s.byteLength; i++) {
				spawned.emit(s.subarray(i, i + 1));
			}
		}
		const totalLen = sequences.reduce((n, s) => n + s.byteLength, 0);
		const sentHash = sha256(...sequences);

		await waitForBytes(c, id, totalLen, 2000);

		const received = collectPayloads(c, id);
		assert.equal(
			sha256(...received),
			sentHash,
			"non-utf8 bytes must round-trip byte-perfect",
		);
	} finally {
		c.send({ type: "close", id });
		spawned?.finish(0);
		await c.close();
	}
});
