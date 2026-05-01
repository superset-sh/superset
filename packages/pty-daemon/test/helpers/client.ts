// Reusable test client for pty-daemon integration tests.
// Speaks the daemon's wire protocol over a Unix socket.

import * as net from "node:net";
import {
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
} from "../../src/protocol/index.ts";

export interface DaemonClient {
	socket: net.Socket;
	messages: ServerMessage[];
	send(m: unknown): void;
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
				for (const raw of decoder.drain()) {
					const m = raw as ServerMessage;
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
				// Surface frame errors to any pending waiter.
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
				send(m) {
					if (!socket.destroyed) socket.write(encodeFrame(m));
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
							// Final sweep in case of late drains.
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
						// Fall back: if `end` doesn't fire close within 200ms, force.
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

/** Convenience: connect and complete the v1 handshake. */
export async function connectAndHello(
	socketPath: string,
): Promise<DaemonClient> {
	const c = await connect(socketPath);
	c.send({ type: "hello", protocols: [1] });
	await c.waitFor((m) => m.type === "hello-ack");
	return c;
}
