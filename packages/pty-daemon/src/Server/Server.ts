import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import type { Conn, HandlerCtx } from "../handlers/index.ts";
import {
	handleClose,
	handleInput,
	handleList,
	handleOpen,
	handleResize,
	handleSubscribe,
	handleUnsubscribe,
} from "../handlers/index.ts";
import {
	type ClientMessage,
	encodeFrame,
	FrameDecoder,
	type HelloMessage,
	type ServerMessage,
	SUPPORTED_PROTOCOL_VERSIONS,
} from "../protocol/index.ts";
import type { Session } from "../SessionStore/index.ts";
import { SessionStore } from "../SessionStore/index.ts";

export interface ServerOptions {
	socketPath: string;
	daemonVersion: string;
	bufferCap?: number;
}

interface ConnState extends Conn {
	socket: net.Socket;
	decoder: FrameDecoder;
	negotiated: number | null;
}

export class Server {
	private readonly server: net.Server;
	private readonly store: SessionStore;
	private readonly conns = new Set<ConnState>();
	private readonly opts: ServerOptions;

	constructor(opts: ServerOptions) {
		this.opts = opts;
		this.store = new SessionStore({ bufferCap: opts.bufferCap });
		this.server = net.createServer((socket) => this.onConnection(socket));
	}

	async listen(): Promise<void> {
		const dir = path.dirname(this.opts.socketPath);
		fs.mkdirSync(dir, { recursive: true });
		// Stale-socket cleanup: remove any prior socket file at this path.
		try {
			fs.unlinkSync(this.opts.socketPath);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
		}
		await new Promise<void>((resolve, reject) => {
			this.server.once("error", reject);
			this.server.listen(this.opts.socketPath, () => {
				this.server.off("error", reject);
				resolve();
			});
		});
		// Owner-only access. The socket file IS the auth boundary.
		fs.chmodSync(this.opts.socketPath, 0o600);
	}

	async close(): Promise<void> {
		for (const c of this.conns) c.socket.destroy();
		this.conns.clear();
		// Kill all owned PTYs so the daemon process can actually exit (open
		// master fds keep the event loop alive). This is what the v1 lessons
		// call "synchronous teardown only" — no setTimeout, no graceful drain.
		for (const session of this.store.all()) {
			try {
				session.pty.kill("SIGKILL");
			} catch {
				// already dead, ignore
			}
		}
		await new Promise<void>((resolve) => this.server.close(() => resolve()));
		try {
			fs.unlinkSync(this.opts.socketPath);
		} catch {
			// ignore
		}
	}

	private onConnection(socket: net.Socket): void {
		const conn: ConnState = {
			socket,
			decoder: new FrameDecoder(),
			negotiated: null,
			subscriptions: new Set(),
			send: (msg) => writeMessage(socket, msg),
		};
		this.conns.add(conn);

		socket.on("data", (chunk) => {
			try {
				conn.decoder.push(chunk);
				for (const raw of conn.decoder.drain()) {
					this.dispatch(conn, raw as ClientMessage);
				}
			} catch (err) {
				conn.send({
					type: "error",
					message: (err as Error).message,
					code: "EPROTO",
				});
				socket.destroy();
			}
		});
		socket.on("close", () => {
			this.conns.delete(conn);
		});
		socket.on("error", () => {
			this.conns.delete(conn);
		});
	}

	private dispatch(conn: ConnState, msg: ClientMessage): void {
		// Handshake must come first.
		if (conn.negotiated === null) {
			if (msg.type !== "hello") {
				conn.send({ type: "error", message: "expected hello", code: "EPROTO" });
				conn.socket.destroy();
				return;
			}
			const negotiated = pickProtocol(msg);
			if (negotiated === null) {
				conn.send({
					type: "error",
					message: `no compatible protocol; daemon supports ${SUPPORTED_PROTOCOL_VERSIONS.join(",")}`,
					code: "EVERSION",
				});
				conn.socket.destroy();
				return;
			}
			conn.negotiated = negotiated;
			conn.send({
				type: "hello-ack",
				protocol: negotiated,
				daemonVersion: this.opts.daemonVersion,
			});
			return;
		}

		const ctx = this.handlerCtx();
		switch (msg.type) {
			case "hello": {
				conn.send({
					type: "error",
					message: "duplicate hello",
					code: "EPROTO",
				});
				return;
			}
			case "open": {
				conn.send(handleOpen(ctx, msg));
				return;
			}
			case "input": {
				const reply = handleInput(ctx, msg);
				if (reply) conn.send(reply);
				return;
			}
			case "resize": {
				const reply = handleResize(ctx, msg);
				if (reply) conn.send(reply);
				return;
			}
			case "close": {
				conn.send(handleClose(ctx, msg));
				return;
			}
			case "list": {
				conn.send(handleList(ctx));
				return;
			}
			case "subscribe": {
				handleSubscribe(ctx, conn, msg);
				return;
			}
			case "unsubscribe": {
				handleUnsubscribe(conn, msg);
				return;
			}
			default: {
				const t = (msg as { type: string }).type;
				conn.send({
					type: "error",
					message: `unknown op: ${t}`,
					code: "EPROTO",
				});
				return;
			}
		}
	}

	private handlerCtx(): HandlerCtx {
		return {
			store: this.store,
			wireSession: (session) => this.wireSession(session),
		};
	}

	/**
	 * Pipe the session's PTY events into the broadcast set: any connection
	 * subscribed to this session id receives the output / exit frames.
	 */
	private wireSession(session: Session): void {
		session.pty.onData((chunk) => {
			this.store.appendOutput(session, chunk);
			const out: ServerMessage = {
				type: "output",
				id: session.id,
				data: chunk.toString("base64"),
			};
			for (const c of this.conns) {
				if (c.subscriptions.has(session.id)) c.send(out);
			}
		});
		session.pty.onExit((info) => {
			session.exited = true;
			session.exitCode = info.code;
			session.exitSignal = info.signal;
			const ev: ServerMessage = {
				type: "exit",
				id: session.id,
				code: info.code,
				signal: info.signal,
			};
			for (const c of this.conns) {
				if (c.subscriptions.has(session.id)) {
					c.send(ev);
					c.subscriptions.delete(session.id);
				}
			}
			// Delete the session immediately. Without this, every closed
			// terminal pane left a row in the store forever — list-reply
			// inflated, memory grew unbounded.
			//
			// Tradeoff: a late subscriber that connects after this point
			// (e.g. host-service restarting *during* the shell exit window)
			// gets ENOENT instead of the buffered output + exit event. The
			// renderer's xterm.js already has whatever was rendered before
			// disconnect — it just loses the "Process exited with code N"
			// footer for that narrow window.
			this.store.delete(session.id);
		});
	}
}

function pickProtocol(hello: HelloMessage): number | null {
	const supported = new Set(SUPPORTED_PROTOCOL_VERSIONS);
	let best: number | null = null;
	for (const v of hello.protocols) {
		if (supported.has(v) && (best === null || v > best)) best = v;
	}
	return best;
}

function writeMessage(socket: net.Socket, msg: ServerMessage): void {
	if (socket.destroyed) return;
	socket.write(encodeFrame(msg));
}
