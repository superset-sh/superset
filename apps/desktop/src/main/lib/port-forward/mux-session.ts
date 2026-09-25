import { Duplex } from "node:stream";
import {
	decodeHelloVersion,
	decodeMuxFrame,
	decodeOpenFail,
	decodeWindowDelta,
	encodeClose,
	encodeData,
	encodeEof,
	encodeOpen,
	encodePing,
	encodeWindow,
	MUX_INITIAL_WINDOW_BYTES,
	MUX_MAX_DATA_BYTES,
	MUX_MAX_STREAMS,
	MUX_PING_INTERVAL_MS,
	MUX_PONG_TIMEOUT_MS,
	MUX_PROTOCOL_VERSION,
	type MuxFrame,
	MuxFrameType,
} from "@superset/shared/port-forward-mux";
import { WebSocket } from "ws";

const HELLO_TIMEOUT_MS = 15_000;
const OPEN_TIMEOUT_MS = 20_000;
/** A session with no live streams closes itself after this long. */
const IDLE_CLOSE_MS = 60_000;

interface StreamRecord {
	duplex: Duplex;
	/** Bytes we may still send toward the host before it credits us. */
	sendWindow: number;
	/** Chunks waiting on send-window; the head may be partially sent. */
	sendQueue: { chunk: Buffer; done: (err?: Error | null) => void }[];
	headOffset: number;
	/** Received bytes not yet credited back to the host. */
	uncredited: number;
	creditScheduled: boolean;
	/** push() returned false; credits pause until the consumer reads. */
	readPaused: boolean;
	settleOpen: {
		resolve: (d: Duplex) => void;
		reject: (err: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	} | null;
	remoteClosed: boolean;
}

/**
 * The desktop end of one port-forward mux session — one WebSocket through
 * the relay per (host, workspace), every forwarded TCP connection a numbered
 * stream inside it (@superset/shared/port-forward-mux). Opening a connection
 * costs one OPEN frame on this warm pipe instead of a relay dial-back.
 */
export class MuxSession {
	/** Resolves once the host's HELLO proves it speaks the protocol. */
	readonly ready: Promise<void>;
	private readonly ws: WebSocket;
	private readonly streams = new Map<number, StreamRecord>();
	private nextStreamId = 1;
	private dead = false;
	private helloSeen = false;
	private lastPongAt = Date.now();
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		url: string,
		private readonly options: { onClosed: () => void },
	) {
		this.ws = new WebSocket(url);
		this.ready = new Promise<void>((resolve, reject) => {
			const helloTimer = setTimeout(() => {
				this.ws.terminate();
				reject(new Error("Host did not answer"));
			}, HELLO_TIMEOUT_MS);
			this.ws.once("unexpected-response", (_req, res) => {
				clearTimeout(helloTimer);
				reject(new Error(describeUpgradeFailure(res.statusCode)));
			});
			this.ws.once("error", (err) => {
				clearTimeout(helloTimer);
				reject(err);
			});
			this.ws.on("message", (data) => {
				const frame = decodeMuxFrame(toUint8(data));
				if (!frame) return;
				if (!this.helloSeen) {
					if (frame.type !== MuxFrameType.hello) return;
					const version = decodeHelloVersion(frame);
					clearTimeout(helloTimer);
					if (version !== MUX_PROTOCOL_VERSION) {
						this.ws.close(1002, "protocol version mismatch");
						reject(new Error("Host speaks an unsupported forwarding protocol"));
						return;
					}
					this.helloSeen = true;
					this.startTimers();
					this.armIdleClose();
					resolve();
					return;
				}
				this.dispatch(frame);
			});
			this.ws.on("close", () => {
				clearTimeout(helloTimer);
				const reason = this.helloSeen
					? new Error("Forward tunnel disconnected")
					: // An older host-service has no /fwd route; the relay pairs
						// the stream, then the host's own server refuses it.
						new Error(
							"Host does not support port forwarding (update the host-service)",
						);
				this.destroySession(reason);
				reject(reason);
			});
		});
		// A session that never becomes ready surfaces through openStream;
		// nothing awaits `ready` bare.
		this.ready.catch(() => {});
	}

	get isDead(): boolean {
		return this.dead;
	}

	streamCount(): number {
		return this.streams.size;
	}

	openStream(port: number): Promise<Duplex> {
		if (this.dead) {
			return Promise.reject(new Error("Forward tunnel disconnected"));
		}
		if (this.streams.size >= MUX_MAX_STREAMS) {
			return Promise.reject(new Error("Too many concurrent connections"));
		}
		this.cancelIdleClose();
		const id = this.nextStreamId++;
		return new Promise<Duplex>((resolve, reject) => {
			const record: StreamRecord = {
				duplex: null as unknown as Duplex,
				sendWindow: MUX_INITIAL_WINDOW_BYTES,
				sendQueue: [],
				headOffset: 0,
				uncredited: 0,
				creditScheduled: false,
				readPaused: false,
				settleOpen: {
					resolve,
					reject,
					timer: setTimeout(() => {
						this.streams.delete(id);
						this.armIdleClose();
						reject(new Error("Host did not answer"));
					}, OPEN_TIMEOUT_MS),
				},
				remoteClosed: false,
			};
			record.duplex = this.createDuplex(id, record);
			this.streams.set(id, record);
			this.ws.send(encodeOpen(id, port));
		});
	}

	close(): void {
		this.ws.close(1000, "session closed");
	}

	private createDuplex(id: number, record: StreamRecord): Duplex {
		const session = this;
		return new Duplex({
			write(chunk: Buffer, _enc, cb) {
				record.sendQueue.push({ chunk, done: cb });
				session.pumpSend(id, record);
			},
			read() {
				record.readPaused = false;
				session.scheduleCredit(id, record);
			},
			final(cb) {
				if (!session.dead && !record.remoteClosed) {
					session.ws.send(encodeEof(id));
				}
				cb();
			},
			destroy(err, cb) {
				if (session.streams.get(id) === record) {
					session.streams.delete(id);
					if (!session.dead && !record.remoteClosed) {
						session.ws.send(encodeClose(id));
					}
					session.armIdleClose();
				}
				for (const pending of record.sendQueue) {
					pending.done(err ?? new Error("stream destroyed"));
				}
				record.sendQueue = [];
				cb(err);
			},
		});
	}

	private dispatch(frame: MuxFrame): void {
		if (frame.type === MuxFrameType.pong) {
			this.lastPongAt = Date.now();
			return;
		}
		const record = this.streams.get(frame.streamId);
		// Frames racing our CLOSE for an already-dropped stream are normal.
		if (!record) return;

		switch (frame.type) {
			case MuxFrameType.opened: {
				if (record.settleOpen) {
					clearTimeout(record.settleOpen.timer);
					const { resolve } = record.settleOpen;
					record.settleOpen = null;
					resolve(record.duplex);
				}
				return;
			}
			case MuxFrameType.openFail: {
				this.streams.delete(frame.streamId);
				this.armIdleClose();
				if (record.settleOpen) {
					clearTimeout(record.settleOpen.timer);
					const { reject } = record.settleOpen;
					record.settleOpen = null;
					reject(new Error(decodeOpenFail(frame).message));
				}
				return;
			}
			case MuxFrameType.data: {
				const chunk = Buffer.from(frame.payload);
				record.uncredited += chunk.byteLength;
				if (!record.duplex.push(chunk)) {
					record.readPaused = true;
				}
				this.scheduleCredit(frame.streamId, record);
				return;
			}
			case MuxFrameType.window: {
				const delta = decodeWindowDelta(frame);
				if (delta !== null) {
					record.sendWindow += delta;
					this.pumpSend(frame.streamId, record);
				}
				return;
			}
			case MuxFrameType.eof: {
				record.duplex.push(null);
				return;
			}
			case MuxFrameType.close: {
				record.remoteClosed = true;
				this.streams.delete(frame.streamId);
				this.armIdleClose();
				if (record.settleOpen) {
					clearTimeout(record.settleOpen.timer);
					const { reject } = record.settleOpen;
					record.settleOpen = null;
					reject(new Error("Connection refused by host"));
					return;
				}
				record.duplex.destroy();
				return;
			}
			default:
				return;
		}
	}

	private pumpSend(id: number, record: StreamRecord): void {
		if (this.dead) return;
		while (record.sendQueue.length > 0 && record.sendWindow > 0) {
			const head = record.sendQueue[0];
			const remaining = head.chunk.byteLength - record.headOffset;
			const len = Math.min(remaining, record.sendWindow, MUX_MAX_DATA_BYTES);
			this.ws.send(
				encodeData(
					id,
					head.chunk.subarray(record.headOffset, record.headOffset + len),
				),
			);
			record.sendWindow -= len;
			record.headOffset += len;
			if (record.headOffset === head.chunk.byteLength) {
				record.sendQueue.shift();
				record.headOffset = 0;
				// Completing the write callback only once the bytes are inside
				// the window is what propagates backpressure to the local socket.
				head.done();
			}
		}
	}

	// Credits are flushed once per tick so a burst of DATA frames becomes one
	// WINDOW frame. A paused reader holds credits entirely; _read releases.
	private scheduleCredit(id: number, record: StreamRecord): void {
		if (record.creditScheduled) return;
		record.creditScheduled = true;
		setImmediate(() => {
			record.creditScheduled = false;
			if (this.dead || this.streams.get(id) !== record) return;
			if (record.readPaused) return;
			if (record.uncredited > 0) {
				this.ws.send(encodeWindow(id, record.uncredited));
				record.uncredited = 0;
			}
		});
	}

	private startTimers(): void {
		this.pingTimer = setInterval(() => {
			if (Date.now() - this.lastPongAt > MUX_PONG_TIMEOUT_MS) {
				this.ws.terminate();
				return;
			}
			if (this.ws.readyState === WebSocket.OPEN) {
				this.ws.send(encodePing());
			}
		}, MUX_PING_INTERVAL_MS);
		this.pingTimer.unref?.();
	}

	private armIdleClose(): void {
		if (this.dead || this.streams.size > 0) return;
		this.cancelIdleClose();
		this.idleTimer = setTimeout(() => {
			if (this.streams.size === 0) this.close();
		}, IDLE_CLOSE_MS);
		this.idleTimer.unref?.();
	}

	private cancelIdleClose(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}

	private destroySession(reason: Error): void {
		if (this.dead) return;
		this.dead = true;
		if (this.pingTimer) clearInterval(this.pingTimer);
		this.cancelIdleClose();
		for (const [id, record] of this.streams) {
			this.streams.delete(id);
			if (record.settleOpen) {
				clearTimeout(record.settleOpen.timer);
				record.settleOpen.reject(reason);
			} else {
				record.duplex.destroy(reason);
			}
		}
		this.options.onClosed();
	}
}

function toUint8(data: Buffer | ArrayBuffer | Buffer[]): Uint8Array {
	if (Buffer.isBuffer(data)) return data;
	if (Array.isArray(data)) return Buffer.concat(data);
	return new Uint8Array(data);
}

export function describeUpgradeFailure(status: number | undefined): string {
	switch (status) {
		case 401:
			return "Session expired, sign in again";
		case 403:
			return "No access to this host";
		case 503:
			return "Host is offline";
		case 504:
			return "Host did not answer";
		default:
			return `Relay refused the stream (${status ?? "unknown"})`;
	}
}
