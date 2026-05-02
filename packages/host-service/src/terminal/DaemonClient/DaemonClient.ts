// Client for the pty-daemon Unix-socket protocol.
//
// host-service holds a single long-lived DaemonClient. PTYs are owned by the
// daemon; this client is purely a thin transport over the socket: send typed
// requests, receive typed events, route output/exit to per-session callbacks.
//
// Lifecycle:
//   - connect() opens the socket and completes the handshake.
//   - subscribe(sessionId) registers callbacks; you'll receive every output
//     and exit frame the daemon emits for that session id.
//   - dispose() closes the socket; the daemon keeps owning sessions.
//
// Failure model: connection-level errors (daemon crash, socket close) are
// surfaced via onDisconnect. The desktop coordinator is responsible for
// respawning the daemon and host-service can reconnect by constructing a new
// DaemonClient. There is no in-band reconnect logic here — keep it dumb.

import * as net from "node:net";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
	type SessionInfo,
	type SessionMeta,
} from "@superset/pty-daemon/protocol";

export interface OpenResult {
	id: string;
	pid: number;
}

export interface ExitInfo {
	code: number | null;
	signal: number | null;
}

export type Signal = "SIGINT" | "SIGTERM" | "SIGKILL" | "SIGHUP";

export interface SubscribeCallbacks {
	onOutput: (chunk: Buffer) => void;
	onExit: (info: ExitInfo) => void;
}

interface SessionCallbacks {
	output: Set<(chunk: Buffer) => void>;
	exit: Set<(info: ExitInfo) => void>;
}

export interface DaemonClientOptions {
	socketPath: string;
	connectTimeoutMs?: number;
}

/**
 * Per-request timeouts. The daemon should respond within milliseconds for
 * close/list, and within a few seconds for open (PTY spawn includes shell
 * startup). Without these, a live-but-stuck daemon can hang callers
 * indefinitely — a real risk if `node-pty.spawn` ever blocks.
 */
const OPEN_TIMEOUT_MS = 15_000;
const CLOSE_TIMEOUT_MS = 5_000;
const LIST_TIMEOUT_MS = 5_000;

export class DaemonClient {
	private readonly opts: DaemonClientOptions;
	private socket: net.Socket | null = null;
	private decoder = new FrameDecoder();
	private readonly callbacks = new Map<string, SessionCallbacks>();
	private readonly disconnectCbs = new Set<(err?: Error) => void>();
	private daemonVersion = "";
	private negotiated: number | null = null;
	private connected = false;

	constructor(opts: DaemonClientOptions) {
		this.opts = opts;
	}

	async connect(): Promise<void> {
		const socket = await openSocket(this.opts);
		this.socket = socket;
		socket.on("data", (chunk) => this.onData(chunk));
		socket.on("close", () => this.onClose());
		socket.on("error", (err) => this.onClose(err));
		try {
			await this.handshake();
		} catch (err) {
			// Handshake rejected — destroy the socket and clear state so the
			// caller's retry sees a clean slate. Without this, the socket and
			// its listeners leak across failed connect attempts.
			this.socket = null;
			socket.removeAllListeners();
			socket.destroy();
			throw err;
		}
		this.connected = true;
	}

	get isConnected(): boolean {
		return this.connected && this.socket !== null && !this.socket.destroyed;
	}

	get version(): string {
		return this.daemonVersion;
	}

	get protocol(): number {
		return this.negotiated ?? CURRENT_PROTOCOL_VERSION;
	}

	onDisconnect(cb: (err?: Error) => void): () => void {
		this.disconnectCbs.add(cb);
		return () => {
			this.disconnectCbs.delete(cb);
		};
	}

	async open(id: string, meta: SessionMeta): Promise<OpenResult> {
		const reply = await this.requestSession(
			id,
			{ type: "open", id, meta },
			OPEN_TIMEOUT_MS,
		);
		if (reply.type === "open-ok") return { id, pid: reply.pid };
		if (reply.type === "error") throw new Error(`open ${id}: ${reply.message}`);
		throw new Error(`open ${id}: unexpected reply ${reply.type}`);
	}

	async close(id: string, signal: Signal = "SIGHUP"): Promise<void> {
		const reply = await this.requestSession(
			id,
			{ type: "close", id, signal },
			CLOSE_TIMEOUT_MS,
		);
		if (reply.type === "closed") return;
		if (reply.type === "error")
			throw new Error(`close ${id}: ${reply.message}`);
		throw new Error(`close ${id}: unexpected reply ${reply.type}`);
	}

	async list(): Promise<SessionInfo[]> {
		const reply = await this.requestNonSession(
			{ type: "list" },
			"list-reply",
			LIST_TIMEOUT_MS,
		);
		if (reply.type === "list-reply") return reply.sessions;
		throw new Error(`list: unexpected reply ${reply.type}`);
	}

	/** Fire-and-forget; bytes go straight to the PTY. */
	input(id: string, data: Buffer): void {
		// Bytes ride in the frame's binary tail (see ../../protocol/framing.ts).
		// No base64 hop on either side.
		this.send({ type: "input", id }, data);
	}

	/** Fire-and-forget; daemon validates dims. */
	resize(id: string, cols: number, rows: number): void {
		this.send({ type: "resize", id, cols, rows });
	}

	/**
	 * Subscribe to a session's output + exit stream. Returns an unsubscribe
	 * function. With `replay: true` the daemon sends its current ring buffer
	 * before live streaming begins. Multiple subscribers per session are
	 * supported — the daemon fans output out to all of them.
	 */
	subscribe(
		id: string,
		opts: { replay: boolean },
		cb: SubscribeCallbacks,
	): () => void {
		let entry = this.callbacks.get(id);
		const wasFirst = !entry;
		if (!entry) {
			entry = { output: new Set(), exit: new Set() };
			this.callbacks.set(id, entry);
		}
		entry.output.add(cb.onOutput);
		entry.exit.add(cb.onExit);
		// Only the first subscribe per session id sends the wire `subscribe`.
		// Subsequent local callbacks just register into the existing entry.
		// The daemon's ring buffer is delivered once, on the first subscribe
		// — so `replay: true` only makes sense on a fresh subscription.
		// Loud-fail the surprising case where a later subscriber asks for
		// replay; the caller needs to replay from a server-side cache
		// instead (see terminal.ts replayBuffer).
		if (!wasFirst && opts.replay) {
			throw new Error(
				`subscribe(${id}): replay is not available on a second subscribe; the daemon's buffer was already consumed.`,
			);
		}
		if (wasFirst) {
			this.send({ type: "subscribe", id, replay: opts.replay });
		}
		return () => {
			const e = this.callbacks.get(id);
			if (!e) return;
			e.output.delete(cb.onOutput);
			e.exit.delete(cb.onExit);
			if (e.output.size === 0 && e.exit.size === 0) {
				this.callbacks.delete(id);
				this.send({ type: "unsubscribe", id });
			}
		};
	}

	async dispose(): Promise<void> {
		this.connected = false;
		const sock = this.socket;
		this.socket = null;
		if (!sock || sock.destroyed) return;
		await new Promise<void>((resolve) => {
			sock.end(() => resolve());
			setTimeout(() => {
				if (!sock.destroyed) sock.destroy();
				resolve();
			}, 200);
		});
	}

	// ---- Internals ----

	private async handshake(): Promise<void> {
		this.send({
			type: "hello",
			protocols: [CURRENT_PROTOCOL_VERSION],
		});
		const ack = await this.waitForFrame(
			(m) => m.type === "hello-ack" || m.type === "error",
			5000,
		);
		if (ack.type === "error") {
			throw new Error(`daemon handshake failed: ${ack.message}`);
		}
		if (ack.type !== "hello-ack") {
			throw new Error(`daemon handshake unexpected reply: ${ack.type}`);
		}
		this.daemonVersion = ack.daemonVersion;
		this.negotiated = ack.protocol;
	}

	private requestSession(
		id: string,
		req:
			| { type: "open"; id: string; meta: SessionMeta }
			| { type: "close"; id: string; signal: Signal },
		timeoutMs: number,
	): Promise<ServerMessage> {
		return new Promise<ServerMessage>((resolve, reject) => {
			let resolved = false;
			const settle = (m: ServerMessage) => {
				if (resolved) return;
				resolved = true;
				cleanup();
				resolve(m);
			};
			const fail = (err: Error) => {
				if (resolved) return;
				resolved = true;
				cleanup();
				reject(err);
			};
			const off = this.on((m) => {
				if (m.type === "error" && m.id === id) settle(m);
				else if (req.type === "open" && m.type === "open-ok" && m.id === id)
					settle(m);
				else if (req.type === "close" && m.type === "closed" && m.id === id)
					settle(m);
			});
			const offDisc = this.onDisconnect((err) =>
				fail(err ?? new Error("daemon disconnected")),
			);
			const timer = setTimeout(
				() =>
					fail(
						new Error(
							`daemon ${req.type} ${id}: timed out after ${timeoutMs}ms`,
						),
					),
				timeoutMs,
			);
			const cleanup = () => {
				off();
				offDisc();
				clearTimeout(timer);
			};
			this.send(req);
		});
	}

	private requestNonSession(
		req: { type: "list" },
		expectType: "list-reply",
		timeoutMs: number,
	): Promise<ServerMessage> {
		return new Promise<ServerMessage>((resolve, reject) => {
			let resolved = false;
			const settle = (m: ServerMessage) => {
				if (resolved) return;
				resolved = true;
				cleanup();
				resolve(m);
			};
			const fail = (err: Error) => {
				if (resolved) return;
				resolved = true;
				cleanup();
				reject(err);
			};
			const off = this.on((m) => {
				if (m.type === expectType) {
					settle(m);
					return;
				}
				// Non-session error frames (no `id`) belong to the
				// most-recent non-session request — settle on those. Errors
				// keyed to a session id come from concurrent ops on that
				// session; ignore them here.
				if (m.type === "error" && m.id === undefined) settle(m);
			});
			const offDisc = this.onDisconnect((err) =>
				fail(err ?? new Error("daemon disconnected")),
			);
			const timer = setTimeout(
				() =>
					fail(new Error(`daemon ${req.type}: timed out after ${timeoutMs}ms`)),
				timeoutMs,
			);
			const cleanup = () => {
				off();
				offDisc();
				clearTimeout(timer);
			};
			this.send(req);
		});
	}

	/** Register a one-shot listener. Returns an unsubscribe; called for every frame until disposed. */
	private on(cb: (m: ServerMessage) => void): () => void {
		this.adhocListeners.add(cb);
		return () => {
			this.adhocListeners.delete(cb);
		};
	}

	private adhocListeners = new Set<(m: ServerMessage) => void>();

	private waitForFrame(
		predicate: (m: ServerMessage) => boolean,
		timeoutMs: number,
	): Promise<ServerMessage> {
		return new Promise<ServerMessage>((resolve, reject) => {
			const off = this.on((m) => {
				if (predicate(m)) {
					off();
					clearTimeout(timer);
					resolve(m);
				}
			});
			const timer = setTimeout(() => {
				off();
				reject(new Error(`daemon: timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});
	}

	private send(msg: unknown, payload?: Uint8Array): void {
		const sock = this.socket;
		if (!sock || sock.destroyed) {
			throw new Error("DaemonClient: socket not connected");
		}
		sock.write(encodeFrame(msg, payload));
	}

	private onData(chunk: Buffer): void {
		this.decoder.push(chunk);
		let frames: ReturnType<FrameDecoder["drain"]>;
		try {
			frames = this.decoder.drain();
		} catch (err) {
			// Protocol decode failure — the wire stream is corrupt. Hard-close
			// the transport so we don't keep accepting data on a broken
			// connection. Without destroy() the socket can keep delivering
			// frames after onClose() has fired.
			this.socket?.destroy();
			this.onClose(err as Error);
			return;
		}
		for (const frame of frames) {
			const msg = frame.message as ServerMessage;
			// Route session-keyed events to subscriber callbacks.
			if (msg.type === "output" && this.callbacks.has(msg.id)) {
				if (frame.payload) {
					// Hand the bytes to subscribers as a Buffer view; same shape
					// they got pre-binary-tail when we base64-decoded into Buffer.
					const buf = Buffer.from(
						frame.payload.buffer,
						frame.payload.byteOffset,
						frame.payload.byteLength,
					);
					for (const cb of this.callbacks.get(msg.id)?.output ?? []) {
						cb(buf);
					}
				}
				continue;
			}
			if (msg.type === "exit" && this.callbacks.has(msg.id)) {
				const info: ExitInfo = { code: msg.code, signal: msg.signal };
				for (const cb of this.callbacks.get(msg.id)?.exit ?? []) {
					cb(info);
				}
				continue;
			}
			// Everything else (open-ok, closed, error, hello-ack, list-reply)
			// goes through the adhoc listener fan-out so request/response
			// helpers can pick it up.
			for (const l of this.adhocListeners) l(msg);
		}
	}

	private onClose(err?: Error): void {
		if (!this.connected && this.socket === null) return;
		this.connected = false;
		this.socket = null;
		for (const cb of this.disconnectCbs) cb(err);
	}
}

function openSocket(opts: DaemonClientOptions): Promise<net.Socket> {
	const timeoutMs = opts.connectTimeoutMs ?? 5000;
	return new Promise<net.Socket>((resolve, reject) => {
		const socket = net.createConnection({ path: opts.socketPath });
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`DaemonClient: connect timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		socket.once("connect", () => {
			clearTimeout(timer);
			resolve(socket);
		});
		socket.once("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}
