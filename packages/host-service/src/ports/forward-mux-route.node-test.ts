import assert from "node:assert/strict";
import net from "node:net";
import { after, before, test } from "node:test";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { DetectedPort } from "@superset/port-scanner";
import {
	decodeMuxFrame,
	decodeOpenFail,
	decodeWindowDelta,
	encodeClose,
	encodeData,
	encodeEof,
	encodeOpen,
	encodePing,
	MUX_INITIAL_WINDOW_BYTES,
	MUX_MAX_DATA_BYTES,
	type MuxFrame,
	MuxFrameType,
	MuxOpenFailCode,
} from "@superset/shared/port-forward-mux";
import { Hono } from "hono";
import { registerForwardMuxRoute } from "./forward-mux-route.ts";

const WORKSPACE_ID = "ws-owner";
let httpServer: ServerType;
let httpPort = 0;
let echoServer: net.Server;
let echoPort = 0;
let v6EchoServer: net.Server;
let v6EchoPort = 0;
let closedEchoPort = 0;
const echoSockets = new Set<net.Socket>();

function ownedPort(port: number, address = "127.0.0.1"): DetectedPort {
	return {
		port,
		pid: 1,
		processName: "echo",
		terminalId: "t1",
		workspaceId: WORKSPACE_ID,
		detectedAt: 0,
		address,
	};
}

before(async () => {
	echoServer = net.createServer((socket) => {
		echoSockets.add(socket);
		socket.on("close", () => echoSockets.delete(socket));
		socket.pipe(socket);
	});
	echoPort = await new Promise<number>((resolve) => {
		echoServer.listen(0, "127.0.0.1", () => {
			resolve((echoServer.address() as net.AddressInfo).port);
		});
	});
	// Vite 8's `localhost` bind can resolve to the v6 loopback only; the
	// route must dial the address the scanner saw, not assume v4.
	v6EchoServer = net.createServer((socket) => socket.pipe(socket));
	v6EchoPort = await new Promise<number>((resolve) => {
		v6EchoServer.listen(0, "::1", () => {
			resolve((v6EchoServer.address() as net.AddressInfo).port);
		});
	});

	// A port the scanner attributes to the workspace but nothing listens on.
	const probe = net.createServer();
	closedEchoPort = await new Promise<number>((resolve) => {
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});

	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
	registerForwardMuxRoute({
		app,
		upgradeWebSocket,
		getPortsByWorkspace: (workspaceId) =>
			workspaceId === WORKSPACE_ID
				? [
						ownedPort(echoPort),
						ownedPort(v6EchoPort, "::1"),
						ownedPort(closedEchoPort),
					]
				: [],
	});
	httpPort = await new Promise<number>((resolve) => {
		httpServer = serve(
			{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
			(info) => resolve(info.port),
		);
	});
	injectWebSocket(httpServer);
});

after(async () => {
	for (const s of echoSockets) s.destroy();
	await new Promise<void>((r) => echoServer.close(() => r()));
	await new Promise<void>((r) => v6EchoServer.close(() => r()));
	await new Promise<void>((r) => httpServer.close(() => r()));
});

/** A test client that collects decoded frames and lets tests await them. */
class MuxClient {
	readonly ws: WebSocket;
	private readonly frames: MuxFrame[] = [];
	private waiters: (() => void)[] = [];
	closed: Promise<{ code: number; reason: string }>;

	constructor(query = `workspaceId=${WORKSPACE_ID}`) {
		this.ws = new WebSocket(`ws://127.0.0.1:${httpPort}/fwd?${query}`);
		this.ws.binaryType = "arraybuffer";
		this.ws.addEventListener("message", (event) => {
			const frame = decodeMuxFrame(new Uint8Array(event.data as ArrayBuffer));
			if (frame) {
				this.frames.push(frame);
				for (const w of this.waiters) w();
				this.waiters = [];
			}
		});
		this.closed = new Promise((resolve) => {
			this.ws.addEventListener("close", (event) =>
				resolve({ code: event.code, reason: event.reason }),
			);
		});
	}

	open(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.ws.addEventListener("open", () => resolve(), { once: true });
			this.ws.addEventListener("error", () => reject(new Error("ws error")), {
				once: true,
			});
		});
	}

	send(bytes: Uint8Array): void {
		this.ws.send(bytes);
	}

	/** Waits for the first not-yet-consumed frame matching the predicate. */
	async next(
		match: (f: MuxFrame) => boolean,
		timeoutMs = 3000,
	): Promise<MuxFrame> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const idx = this.frames.findIndex(match);
			const found = idx >= 0 ? this.frames.splice(idx, 1)[0] : undefined;
			if (found) return found;
			if (Date.now() > deadline) throw new Error("frame wait timed out");
			await new Promise<void>((resolve) => {
				this.waiters.push(resolve);
				setTimeout(resolve, 50);
			});
		}
	}

	/** Concatenated DATA payloads consumed for one stream. */
	async data(streamId: number, minBytes: number): Promise<Buffer> {
		const parts: Buffer[] = [];
		let total = 0;
		while (total < minBytes) {
			const f = await this.next(
				(f) => f.type === MuxFrameType.data && f.streamId === streamId,
			);
			parts.push(Buffer.from(f.payload));
			total += f.payload.byteLength;
		}
		return Buffer.concat(parts);
	}

	close(): void {
		this.ws.close();
	}
}

async function connect(): Promise<MuxClient> {
	const client = new MuxClient();
	await client.open();
	const hello = await client.next((f) => f.type === MuxFrameType.hello);
	assert.equal(hello.payload[0], 1);
	return client;
}

test("hello arrives on open, ping answers pong", async () => {
	const client = await connect();
	client.send(encodePing());
	await client.next((f) => f.type === MuxFrameType.pong);
	client.close();
});

test("missing workspaceId closes with 1008", async () => {
	const client = new MuxClient("");
	await client.open();
	const { code } = await client.closed;
	assert.equal(code, 1008);
});

test("open on an owned port echoes both directions", async () => {
	const client = await connect();
	client.send(encodeOpen(1, echoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 1);
	client.send(encodeData(1, Buffer.from("marco")));
	const echoed = await client.data(1, 5);
	assert.equal(echoed.toString(), "marco");
	client.close();
});

test("a v6-loopback-only server is reachable via its detected address", async () => {
	const client = await connect();
	client.send(encodeOpen(20, v6EchoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 20);
	client.send(encodeData(20, Buffer.from("polo")));
	assert.equal((await client.data(20, 4)).toString(), "polo");
	client.close();
});

test("data sent before OPENED is buffered and delivered in order", async () => {
	const client = await connect();
	client.send(encodeOpen(2, echoPort));
	// No await: these race the upstream connect.
	client.send(encodeData(2, Buffer.from("ab")));
	client.send(encodeData(2, Buffer.from("cd")));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 2);
	const echoed = await client.data(2, 4);
	assert.equal(echoed.toString(), "abcd");
	client.close();
});

test("open on a port the workspace does not own fails", async () => {
	const client = await connect();
	client.send(encodeOpen(3, 1));
	const fail = await client.next(
		(f) => f.type === MuxFrameType.openFail && f.streamId === 3,
	);
	assert.equal(decodeOpenFail(fail).code, MuxOpenFailCode.portNotOwned);
	// The session survives a refused stream.
	client.send(encodePing());
	await client.next((f) => f.type === MuxFrameType.pong);
	client.close();
});

test("open on an owned but dead port fails with connect-failed", async () => {
	const client = await connect();
	client.send(encodeOpen(4, closedEchoPort));
	const fail = await client.next(
		(f) => f.type === MuxFrameType.openFail && f.streamId === 4,
	);
	assert.equal(decodeOpenFail(fail).code, MuxOpenFailCode.connectFailed);
	client.close();
});

test("two streams to the same port stay independent", async () => {
	const client = await connect();
	client.send(encodeOpen(5, echoPort));
	client.send(encodeOpen(6, echoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 5);
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 6);
	client.send(encodeData(5, Buffer.from("five")));
	client.send(encodeData(6, Buffer.from("six")));
	assert.equal((await client.data(5, 4)).toString(), "five");
	assert.equal((await client.data(6, 3)).toString(), "six");
	// Closing one stream leaves the other alive.
	client.send(encodeClose(5));
	client.send(encodeData(6, Buffer.from("!")));
	assert.equal((await client.data(6, 1)).toString(), "!");
	client.close();
});

test("host credits WINDOW as it writes into the upstream socket", async () => {
	const client = await connect();
	client.send(encodeOpen(7, echoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 7);
	const payload = Buffer.alloc(64 * 1024, 0x61);
	client.send(encodeData(7, payload));
	const win = await client.next(
		(f) => f.type === MuxFrameType.window && f.streamId === 7,
	);
	assert.equal(decodeWindowDelta(win), payload.byteLength);
	client.close();
});

test("a large echo round-trips intact and within frame bounds", async () => {
	const client = await connect();
	client.send(encodeOpen(8, echoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 8);
	// Half the initial window: no client-side crediting needed in this test.
	const size = MUX_INITIAL_WINDOW_BYTES / 2;
	const payload = Buffer.alloc(size);
	for (let i = 0; i < size; i++) payload[i] = i % 251;
	for (let off = 0; off < size; off += MUX_MAX_DATA_BYTES) {
		client.send(encodeData(8, payload.subarray(off, off + MUX_MAX_DATA_BYTES)));
	}
	const echoed = await client.data(8, size);
	assert.equal(echoed.byteLength, size);
	assert.ok(echoed.equals(payload));
	client.close();
});

test("EOF half-closes toward the upstream and its close comes back", async () => {
	const client = await connect();
	client.send(encodeOpen(9, echoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 9);
	client.send(encodeData(9, Buffer.from("last")));
	assert.equal((await client.data(9, 4)).toString(), "last");
	client.send(encodeEof(9));
	// echo server sees end → ends its side → host relays EOF then CLOSE.
	await client.next(
		(f) =>
			(f.type === MuxFrameType.eof || f.type === MuxFrameType.close) &&
			f.streamId === 9,
	);
	client.close();
});

test("closing the session destroys upstream sockets", async () => {
	const client = await connect();
	client.send(encodeOpen(10, echoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 10);
	assert.equal(echoSockets.size >= 1, true);
	const before = echoSockets.size;
	client.close();
	const deadline = Date.now() + 3000;
	while (echoSockets.size >= before && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 25));
	}
	assert.ok(echoSockets.size < before);
});

test("text frames close the session with 1003", async () => {
	const client = await connect();
	client.ws.send("nope");
	const { code } = await client.closed;
	assert.equal(code, 1003);
});

test("a malformed frame closes the session with 1002", async () => {
	const client = await connect();
	client.send(new Uint8Array([0x7f, 0, 0, 0, 1, 9]));
	const { code } = await client.closed;
	assert.equal(code, 1002);
});

test("reusing a live stream id is a protocol error", async () => {
	const client = await connect();
	client.send(encodeOpen(11, echoPort));
	await client.next((f) => f.type === MuxFrameType.opened && f.streamId === 11);
	client.send(encodeOpen(11, echoPort));
	const { code } = await client.closed;
	assert.equal(code, 1002);
});
