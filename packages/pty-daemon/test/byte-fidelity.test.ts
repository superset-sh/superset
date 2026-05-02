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
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import type {
	Pty,
	PtyOnData,
	PtyOnExit,
	SpawnOptions,
} from "../src/Pty/index.ts";
import { Server } from "../src/Server/index.ts";
import { connectAndHello, payloadOf } from "./helpers/client.ts";

const sockPath = path.join(os.tmpdir(), `pty-daemon-bytes-${process.pid}.sock`);

/**
 * A driveable fake PTY: the test calls `emit(bytes)` whenever it wants the
 * "shell" to produce output. Lets us inject arbitrary byte sequences without
 * a real shell or PTY's cooked-mode quirks (echo, line discipline, CRLF).
 */
interface DriveablePty extends Pty {
	emit(bytes: Uint8Array): void;
	finish(code: number): void;
}

let nextPid = 5000;
let lastSpawned: DriveablePty | null = null;

function makeDriveablePty(meta: SpawnOptions["meta"]): DriveablePty {
	const onDataCbs: PtyOnData[] = [];
	const onExitCbs: PtyOnExit[] = [];
	const pid = nextPid++;
	return {
		pid,
		meta,
		write: () => {},
		resize: () => {},
		kill: () => {},
		onData: (cb) => {
			onDataCbs.push(cb);
		},
		onExit: (cb) => {
			onExitCbs.push(cb);
		},
		emit: (bytes) => {
			for (const cb of onDataCbs) cb(Buffer.from(bytes));
		},
		finish: (code) => {
			for (const cb of onExitCbs) cb({ code, signal: null });
		},
	};
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
	c: Awaited<ReturnType<typeof connectAndHello>>,
	id: string,
	replay: boolean,
): Promise<void> {
	c.send({ type: "subscribe", id, replay });
	c.send({ type: "list" });
	await c.waitFor((m) => m.type === "list-reply", 1000);
}

async function waitForBytes(
	c: Awaited<ReturnType<typeof connectAndHello>>,
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

function collectPayloads(
	c: Awaited<ReturnType<typeof connectAndHello>>,
	id: string,
): Uint8Array[] {
	const out: Uint8Array[] = [];
	for (const m of c.messages) {
		if (m.type === "output" && m.id === id) {
			const p = payloadOf(m);
			if (p) out.push(p);
		}
	}
	return out;
}

test("live stream: random bytes survive daemon → host byte-perfect", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fid-live";
	c.send({ type: "open", id, meta: META });
	await c.waitFor((m) => m.type === "open-ok" && m.id === id);
	const spawned = lastSpawned;
	assert.ok(spawned, "spawnPty hook must have fired");
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

	c.send({ type: "close", id });
	await c.close();
});

test("replay: random bytes from ring buffer survive byte-perfect", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fid-replay";
	c.send({ type: "open", id, meta: META });
	await c.waitFor((m) => m.type === "open-ok" && m.id === id);
	const spawned = lastSpawned;
	assert.ok(spawned, "spawnPty hook must have fired");

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

	c.send({ type: "close", id });
	await c.close();
});

test("non-UTF-8 byte sequences survive (the regression class)", async () => {
	// The original bug ate bytes that weren't valid UTF-8 when split across
	// chunks. Hand-craft a payload of explicitly-invalid sequences and split
	// each one byte-by-byte to maximize the boundary-mangling surface.
	const c = await connectAndHello(sockPath);
	const id = "fid-non-utf8";
	c.send({ type: "open", id, meta: META });
	await c.waitFor((m) => m.type === "open-ok" && m.id === id);
	const spawned = lastSpawned;
	assert.ok(spawned, "spawnPty hook must have fired");
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

	c.send({ type: "close", id });
	await c.close();
});
