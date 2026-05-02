// Reusable test client for pty-daemon integration tests.
// Speaks the daemon's wire protocol (v2) over a Unix socket.

import * as net from "node:net";
import {
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
} from "../../src/protocol/index.ts";

// Each decoded frame's binary tail (if any) is parked here, keyed by the
// JSON message object. Tests that want output bytes use `payloadOf(m)`.
// WeakMap so it cleans up if the message object is dropped.
const payloads = new WeakMap<object, Uint8Array>();

export function payloadOf(message: ServerMessage): Uint8Array | null {
	return payloads.get(message as object) ?? null;
}

/**
 * UTF-8 view of an output message's payload, for log/text assertions.
 *
 * IMPORTANT: this decodes a SINGLE frame's payload — if a multi-byte
 * codepoint straddles two daemon `output` frames, decoding each frame
 * individually emits U+FFFD even though the bytes are intact on the wire.
 * Safe for ASCII markers ("first-marker", "BURST:200", etc.) where the
 * needle survives per-frame decoding by construction. For multi-byte
 * markers (emoji, accented text), use {@link accumulatedOutputAsString}.
 */
export function payloadAsString(message: ServerMessage): string {
	const p = payloads.get(message as object);
	if (!p) return "";
	return Buffer.from(p).toString("utf8");
}

/**
 * Concatenate every output payload for `id` seen so far, then UTF-8 decode
 * the whole thing once. Use this when the marker you're matching against
 * is multi-byte and could theoretically split across daemon frames.
 */
export function accumulatedOutputAsString(
	client: { messages: ServerMessage[] },
	id: string,
): string {
	const parts: Uint8Array[] = [];
	for (const m of client.messages) {
		if (m.type !== "output" || m.id !== id) continue;
		const p = payloads.get(m as object);
		if (p) parts.push(p);
	}
	if (parts.length === 0) return "";
	let total = 0;
	for (const p of parts) total += p.byteLength;
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		merged.set(p, offset);
		offset += p.byteLength;
	}
	return Buffer.from(merged).toString("utf8");
}

export interface DaemonClient {
	socket: net.Socket;
	messages: ServerMessage[];
	/** Send a control message; optional `payload` rides as the frame's binary tail. */
	send(m: unknown, payload?: Uint8Array): void;
	waitFor(
		predicate: (m: ServerMessage) => boolean,
		ms?: number,
	): Promise<ServerMessage>;
	collect(
		predicate: (m: ServerMessage) => boolean,
		ms: number,
	): Promise<ServerMessage[]>;
	sendRaw(buf: Buffer): void;
	close(): Promise<void>;
	closed(): boolean;
	onClose(cb: () => void): void;
}

interface Waiter {
	predicate: (m: ServerMessage) => boolean;
	resolve: (m: ServerMessage) => void;
	reject: (e: Error) => void;
	timer: NodeJS.Timeout;
}

export function connect(socketPath: string): Promise<DaemonClient> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ path: socketPath });
		const decoder = new FrameDecoder();
		const messages: ServerMessage[] = [];
		const waiters: Waiter[] = [];
		const closeCbs: Array<() => void> = [];
		let isClosed = false;

		socket.on("data", (chunk) => {
			try {
				decoder.push(chunk);
				for (const decoded of decoder.drain()) {
					const m = decoded.message as ServerMessage;
					if (decoded.payload) {
						payloads.set(m as object, decoded.payload);
					}
					messages.push(m);
					for (let i = waiters.length - 1; i >= 0; i--) {
						const w = waiters[i];
						if (w?.predicate(m)) {
							clearTimeout(w.timer);
							waiters.splice(i, 1);
							w.resolve(m);
						}
					}
				}
			} catch (err) {
				for (const w of waiters) {
					clearTimeout(w.timer);
					w.reject(err as Error);
				}
				waiters.length = 0;
			}
		});

		socket.on("close", () => {
			isClosed = true;
			for (const cb of closeCbs) cb();
		});
		socket.once("error", reject);
		socket.once("connect", () => {
			socket.off("error", reject);
			resolve({
				socket,
				messages,
				send(m, payload) {
					if (!socket.destroyed) socket.write(encodeFrame(m, payload));
				},
				sendRaw(buf) {
					if (!socket.destroyed) socket.write(buf);
				},
				waitFor(predicate, ms = 5000) {
					return new Promise<ServerMessage>((res, rej) => {
						const found = messages.find(predicate);
						if (found) return res(found);
						const timer = setTimeout(() => {
							const i = waiters.findIndex((w) => w.predicate === predicate);
							if (i >= 0) waiters.splice(i, 1);
							rej(new Error(`waitFor timed out after ${ms}ms`));
						}, ms);
						waiters.push({ predicate, resolve: res, reject: rej, timer });
					});
				},
				collect(predicate, ms) {
					return new Promise<ServerMessage[]>((res) => {
						const collected: ServerMessage[] = messages.filter(predicate);
						const onMsg = (chunk: Buffer) => {
							void chunk;
							for (let i = collected.length; i < messages.length; i++) {
								const m = messages[i];
								if (m && predicate(m)) collected.push(m);
							}
						};
						socket.on("data", onMsg);
						setTimeout(() => {
							socket.off("data", onMsg);
							for (let i = collected.length; i < messages.length; i++) {
								const m = messages[i];
								if (m && predicate(m)) collected.push(m);
							}
							res(collected);
						}, ms);
					});
				},
				close() {
					return new Promise<void>((res) => {
						if (socket.destroyed) return res();
						socket.end(() => res());
						setTimeout(() => {
							if (!socket.destroyed) socket.destroy();
							res();
						}, 200);
					});
				},
				closed() {
					return isClosed;
				},
				onClose(cb) {
					if (isClosed) cb();
					else closeCbs.push(cb);
				},
			});
		});
	});
}

/** Convenience: connect and complete the v2 handshake. */
export async function connectAndHello(
	socketPath: string,
): Promise<DaemonClient> {
	const c = await connect(socketPath);
	c.send({ type: "hello", protocols: [2] });
	await c.waitFor((m) => m.type === "hello-ack");
	return c;
}
