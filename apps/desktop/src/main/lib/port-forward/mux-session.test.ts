import { afterEach, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import {
	decodeMuxFrame,
	decodeOpenPort,
	decodeWindowDelta,
	encodeClose,
	encodeData,
	encodeEof,
	encodeHello,
	encodeOpened,
	encodeOpenFail,
	encodePong,
	encodeWindow,
	MUX_INITIAL_WINDOW_BYTES,
	MUX_MAX_DATA_BYTES,
	MuxFrameType,
	MuxOpenFailCode,
} from "@superset/shared/port-forward-mux";
import { type WebSocket, WebSocketServer } from "ws";
import { RelayForwardTransport } from "./relay-forward-transport";

/**
 * A protocol-faithful mini host: echoes every stream, credits received DATA,
 * and respects the desktop's WINDOW credits when echoing back.
 */
interface MiniHostStream {
	sendWindow: number;
	queue: Buffer[];
	eofPending: boolean;
	eofSent: boolean;
}

function startMiniHost(options?: {
	skipHello?: boolean;
	closeOnConnect?: boolean;
	refusePort?: number;
}) {
	const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	const sockets = new Set<WebSocket>();
	let connections = 0;

	wss.on("connection", (ws) => {
		connections++;
		sockets.add(ws);
		ws.on("close", () => sockets.delete(ws));
		if (options?.closeOnConnect) {
			ws.close(1008, "nope");
			return;
		}
		if (!options?.skipHello) ws.send(encodeHello());

		const streams = new Map<number, MiniHostStream>();
		const drain = (id: number, s: MiniHostStream) => {
			while (s.queue.length > 0 && s.sendWindow > 0) {
				let chunk = s.queue.shift();
				if (!chunk) break;
				const budget = Math.min(s.sendWindow, MUX_MAX_DATA_BYTES);
				if (chunk.byteLength > budget) {
					s.queue.unshift(chunk.subarray(budget));
					chunk = chunk.subarray(0, budget);
				}
				s.sendWindow -= chunk.byteLength;
				ws.send(encodeData(id, chunk));
			}
			if (s.eofPending && s.queue.length === 0 && !s.eofSent) {
				s.eofSent = true;
				ws.send(encodeEof(id));
			}
		};

		ws.on("message", (raw) => {
			const data = Array.isArray(raw)
				? Buffer.concat(raw)
				: Buffer.isBuffer(raw)
					? raw
					: Buffer.from(raw as ArrayBuffer);
			const frame = decodeMuxFrame(data);
			if (!frame) return;
			switch (frame.type) {
				case MuxFrameType.ping:
					ws.send(encodePong());
					return;
				case MuxFrameType.open: {
					const port = decodeOpenPort(frame);
					if (port !== null && port === options?.refusePort) {
						ws.send(
							encodeOpenFail(
								frame.streamId,
								MuxOpenFailCode.portNotOwned,
								"port not owned by workspace",
							),
						);
						return;
					}
					streams.set(frame.streamId, {
						sendWindow: MUX_INITIAL_WINDOW_BYTES,
						queue: [],
						eofPending: false,
						eofSent: false,
					});
					ws.send(encodeOpened(frame.streamId));
					return;
				}
				case MuxFrameType.data: {
					const s = streams.get(frame.streamId);
					if (!s) return;
					// Credit first (we consumed it), then echo within window.
					ws.send(encodeWindow(frame.streamId, frame.payload.byteLength));
					s.queue.push(Buffer.from(frame.payload));
					drain(frame.streamId, s);
					return;
				}
				case MuxFrameType.window: {
					const s = streams.get(frame.streamId);
					const delta = decodeWindowDelta(frame);
					if (s && delta !== null) {
						s.sendWindow += delta;
						drain(frame.streamId, s);
					}
					return;
				}
				case MuxFrameType.eof: {
					const s = streams.get(frame.streamId);
					if (!s) return;
					s.eofPending = true;
					drain(frame.streamId, s);
					return;
				}
				case MuxFrameType.close: {
					const s = streams.get(frame.streamId);
					if (s) {
						streams.delete(frame.streamId);
						ws.send(encodeClose(frame.streamId));
					}
					return;
				}
				default:
					return;
			}
		});
	});

	const port = (wss.address() as AddressInfo).port;
	return {
		hostUrl: `http://127.0.0.1:${port}`,
		connectionCount: () => connections,
		close: async () => {
			for (const s of sockets) s.terminate();
			// Bun ships its own `ws` shim whose server close callback does not
			// fire while a just-terminated client lingers; don't await it.
			wss.close();
			await new Promise((r) => setTimeout(r, 25));
		},
	};
}

function transportFor(): RelayForwardTransport {
	return new RelayForwardTransport({ getToken: () => "token" });
}

function target(hostUrl: string, remotePort = 3000) {
	return { hostUrl, workspaceId: "ws1", remotePort };
}

const hosts: { close: () => Promise<void> }[] = [];
afterEach(async () => {
	while (hosts.length) await hosts.pop()?.close();
});

function miniHost(options?: Parameters<typeof startMiniHost>[0]) {
	const host = startMiniHost(options);
	hosts.push(host);
	return host;
}

describe("RelayForwardTransport over a mux session", () => {
	test("a stream opens and echoes bytes both ways", async () => {
		const host = miniHost();
		const transport = transportFor();
		const stream = await transport.openStream(target(host.hostUrl));
		stream.write(Buffer.from("marco"));
		const echoed = await new Promise<Buffer>((r) => stream.once("data", r));
		expect(echoed.toString()).toBe("marco");
		stream.destroy();
	});

	test("many streams share one WebSocket connection", async () => {
		const host = miniHost();
		const transport = transportFor();
		const a = await transport.openStream(target(host.hostUrl, 3000));
		const b = await transport.openStream(target(host.hostUrl, 4000));
		a.write(Buffer.from("aaa"));
		b.write(Buffer.from("bbb"));
		const [fromA, fromB] = await Promise.all([
			new Promise<Buffer>((r) => a.once("data", r)),
			new Promise<Buffer>((r) => b.once("data", r)),
		]);
		expect(fromA.toString()).toBe("aaa");
		expect(fromB.toString()).toBe("bbb");
		expect(host.connectionCount()).toBe(1);
		a.destroy();
		b.destroy();
	});

	test("a transfer larger than the window completes intact", async () => {
		const host = miniHost();
		const transport = transportFor();
		const stream = await transport.openStream(target(host.hostUrl));
		const size = MUX_INITIAL_WINDOW_BYTES * 3;
		const payload = Buffer.alloc(size);
		for (let i = 0; i < size; i++) payload[i] = i % 251;

		const received: Buffer[] = [];
		let total = 0;
		const done = new Promise<void>((resolve) => {
			stream.on("data", (chunk: Buffer) => {
				received.push(chunk);
				total += chunk.byteLength;
				if (total >= size) resolve();
			});
		});
		stream.write(payload);
		await done;
		expect(Buffer.concat(received).equals(payload)).toBe(true);
		stream.destroy();
	});

	test("OPEN_FAIL surfaces as a rejected openStream", async () => {
		const host = miniHost({ refusePort: 5432 });
		const transport = transportFor();
		expect(transport.openStream(target(host.hostUrl, 5432))).rejects.toThrow(
			"port not owned by workspace",
		);
	});

	test("an old host closing before HELLO names the real problem", async () => {
		const host = miniHost({ closeOnConnect: true });
		const transport = transportFor();
		expect(transport.openStream(target(host.hostUrl))).rejects.toThrow(
			"Host does not support port forwarding",
		);
	});

	test("ending the local side sends EOF and the echo finishes", async () => {
		const host = miniHost();
		const transport = transportFor();
		const stream = await transport.openStream(target(host.hostUrl));
		const chunks: Buffer[] = [];
		const ended = new Promise<void>((r) => stream.on("end", r));
		stream.on("data", (c: Buffer) => chunks.push(c));
		stream.end(Buffer.from("last words"));
		await ended;
		expect(Buffer.concat(chunks).toString()).toBe("last words");
	});

	test("a dead session rejects, and the next open dials fresh", async () => {
		const host = miniHost();
		const transport = transportFor();
		const stream = await transport.openStream(target(host.hostUrl));
		// The manager always attaches an error handler; without one a dead
		// session's destroy(err) would crash instead of closing.
		stream.on("error", () => {});
		const closed = new Promise<void>((r) => stream.on("close", r));
		await host.close();
		await closed;

		const revived = miniHost();
		// Same transport, new host on a new port: fresh session per key.
		const stream2 = await transport.openStream(target(revived.hostUrl));
		stream2.write(Buffer.from("back"));
		const echoed = await new Promise<Buffer>((r) => stream2.once("data", r));
		expect(echoed.toString()).toBe("back");
		stream2.destroy();
	});
});
