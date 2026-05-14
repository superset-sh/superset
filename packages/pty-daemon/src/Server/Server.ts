import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
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
import { adoptFromFd } from "../Pty/index.ts";
import {
	type ClientMessage,
	encodeFrame,
	FrameDecoder,
	type HandoffMessage,
	type HelloMessage,
	type ServerMessage,
	SUPPORTED_PROTOCOL_VERSIONS,
} from "../protocol/index.ts";
import type { HandoffSnapshot, Session } from "../SessionStore/index.ts";
import {
	SessionStore,
	serializeSessions,
	writeSnapshot,
} from "../SessionStore/index.ts";

export interface ServerOptions {
	socketPath: string;
	daemonVersion: string;
	bufferCap?: number;
	outboundBufferCap?: number;
	/**
	 * Override for the PTY-spawn factory. Production leaves this unset;
	 * `defaultSpawn` (real node-pty) is used. Tests inject a fake here so
	 * they can drive sessions deterministically without a real shell.
	 */
	spawnPty?: HandlerCtx["spawnPty"];
}

const DEFAULT_OUTBOUND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;

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

	/**
	 * Phase 2 handoff: the predecessor's `close()` runs an instant before our
	 * `listen()`, but on a busy system the unlink can race with our bind.
	 * Retry on EADDRINUSE for up to `timeoutMs`. ENOENT-via-bind never happens
	 * (bind always creates the entry), so we don't have to handle it.
	 */
	async listenWithRetry(timeoutMs = 5_000): Promise<void> {
		const start = Date.now();
		let lastErr: unknown = null;
		while (Date.now() - start < timeoutMs) {
			try {
				await this.listen();
				return;
			} catch (err) {
				lastErr = err;
				const code = (err as NodeJS.ErrnoException).code;
				if (code !== "EADDRINUSE") throw err;
				await new Promise((r) => setTimeout(r, 50));
			}
		}
		throw lastErr ?? new Error("listenWithRetry timed out");
	}

	/**
	 * Phase 2 handoff (receiver): rebuild SessionStore from a snapshot the
	 * predecessor wrote. Each session's PTY master fd is taken from the
	 * inherited stdio at `session.fdIndex` (predecessor wrote that index when
	 * building its spawn args).
	 */
	adoptSnapshot(snapshot: HandoffSnapshot): void {
		for (const s of snapshot.sessions) {
			const pty = adoptFromFd({
				fd: s.fdIndex,
				pid: s.pid,
				meta: s.meta,
			});
			const session = this.store.add(s.id, pty);
			if (s.buffer.byteLength > 0) {
				const buf = Buffer.from(
					s.buffer.buffer,
					s.buffer.byteOffset,
					s.buffer.byteLength,
				);
				session.buffer = [buf];
				session.bufferBytes = buf.byteLength;
			}
			this.wireSession(session);
		}
	}

	/**
	 * Phase 2 handoff (sender): spawn a successor process, hand it the live
	 * PTY master fds via stdio inheritance, await its ack, then exit.
	 *
	 * The daemon process running this method exits on success; callers get
	 * a single Promise resolution (or rejection) for the supervisor to relay
	 * back to the user.
	 */
	async prepareUpgrade(): Promise<
		{ ok: true; successorPid: number } | { ok: false; reason: string }
	> {
		const liveSessions = [...this.store.all()].filter((s) => !s.exited);
		const fdIndexBySessionId = new Map<string, number>();

		// stdio array layout in the successor:
		//   [0] ignore (stdin)
		//   [1] inherited stderr/stdout fd (re-use ours so dev-mode log piping keeps working)
		//   [2] inherited stderr fd
		//   [3] 'ipc' — Node-managed control channel
		//   [4..N+3] PTY master fds, one per live session
		const HANDOFF_STDIO_PTY_BASE = 4;
		const stdio: Array<"ignore" | "inherit" | "ipc" | number> = [
			"ignore",
			"inherit",
			"inherit",
			"ipc",
		];
		for (const [i, session] of liveSessions.entries()) {
			fdIndexBySessionId.set(session.id, HANDOFF_STDIO_PTY_BASE + i);
			stdio.push(session.pty.getMasterFd());
		}

		const snapshotPath = path.join(
			os.tmpdir(),
			`pty-daemon-handoff-${process.pid}-${Date.now()}.snap`,
		);
		try {
			writeSnapshot(
				snapshotPath,
				serializeSessions({
					sessions: liveSessions,
					fdIndexBySessionId,
				}),
			);
		} catch (err) {
			return {
				ok: false,
				reason: `snapshot write failed: ${(err as Error).message}`,
			};
		}

		// process.argv[1] is the daemon script path. The supervisor that
		// originally spawned us decided that path; for an upgrade, the bundle
		// at that path has already been replaced by the desktop installer
		// (or a dev rebuild), so spawning it again loads the new bytecode.
		const scriptPath = process.argv[1];
		if (!scriptPath) {
			return { ok: false, reason: "process.argv[1] empty — can't self-spawn" };
		}

		// Forward process.execArgv (--experimental-strip-types etc.) so the
		// successor loads the same way we did. In tests and dev we run TS
		// directly; in production (built bundle) execArgv is typically empty.
		process.stderr.write(
			`[pty-daemon prep-upgrade pid=${process.pid}] spawning successor: ${process.execPath} ${[...process.execArgv, scriptPath].join(" ")} (sessions=${liveSessions.length}, ptyFds=${liveSessions.map((s) => s.pty.getMasterFd()).join(",")})\n`,
		);
		// Don't pass our own pinned version through to the successor — it
		// would report it as its running version, and the supervisor would
		// loop forever auto-updating. Successor reads its bundle's
		// package.json instead.
		const successorEnv: NodeJS.ProcessEnv = { ...process.env };
		delete successorEnv.SUPERSET_PTY_DAEMON_VERSION;
		let child: childProcess.ChildProcess;
		try {
			child = childProcess.spawn(
				process.execPath,
				[
					...process.execArgv,
					scriptPath,
					"--handoff",
					`--snapshot=${snapshotPath}`,
					`--socket=${this.opts.socketPath}`,
				],
				{
					stdio,
					env: successorEnv,
					detached: false,
				},
			);
		} catch (err) {
			try {
				fs.unlinkSync(snapshotPath);
			} catch {
				// best-effort cleanup; keep the original spawn error visible
			}
			return {
				ok: false,
				reason: `successor spawn failed: ${(err as Error).message}`,
			};
		}
		child.on("exit", (code, signal) => {
			process.stderr.write(
				`[pty-daemon prep-upgrade pid=${process.pid}] successor exited code=${code} signal=${signal}\n`,
			);
		});

		const result = await waitForHandoffAck(child);
		if (!result.ok) {
			try {
				child.kill("SIGKILL");
			} catch {
				// already gone
			}
			// Drop the snapshot so a future handoff doesn't trip over it.
			try {
				fs.unlinkSync(snapshotPath);
			} catch {
				// already gone or never written
			}
			return result;
		}

		// Successor adopted. Schedule close+exit AFTER the dispatcher has
		// flushed the upgrade-prepared reply. Closing here would destroy
		// the supervisor's connection before the reply lands. The
		// successor is blocked on our IPC `disconnect` (process.exit closes
		// the channel), so we want to exit promptly — but not so promptly
		// that we beat the reply.
		setImmediate(() => {
			void this.finalizeHandoff();
		});
		return { ok: true, successorPid: result.successorPid };
	}

	/** Phase 2: tear down predecessor state once the upgrade-prepared reply has flushed. */
	private async finalizeHandoff(): Promise<void> {
		// Yield a few microtasks so the conn.send() of upgrade-prepared has
		// a chance to drain into the kernel socket buffer.
		await new Promise((r) => setImmediate(r));
		await new Promise((r) => setImmediate(r));
		// killSessions=false: the master fds are now refcounted in the
		// successor's process; killing them here would close shells the
		// user just successfully preserved.
		await this.close({ killSessions: false });
		setTimeout(() => process.exit(0), 50).unref();
	}

	async close(opts: { killSessions?: boolean } = {}): Promise<void> {
		const killSessions = opts.killSessions ?? true;
		for (const c of this.conns) c.socket.destroy();
		this.conns.clear();
		if (killSessions) {
			// Kill all owned PTYs so the daemon process can actually exit (open
			// master fds keep the event loop alive). This is what the v1
			// lessons call "synchronous teardown only" — no setTimeout, no
			// graceful drain.
			//
			// Phase 2 handoff exit sets killSessions=false: the master fds are
			// being inherited by a successor process, so we must NOT close
			// them here.
			for (const session of this.store.all()) {
				try {
					session.pty.kill("SIGKILL");
				} catch {
					// already dead, ignore
				}
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
		const outboundBufferCap =
			this.opts.outboundBufferCap ?? DEFAULT_OUTBOUND_BUFFER_CAP_BYTES;
		const conn: ConnState = {
			socket,
			decoder: new FrameDecoder(),
			negotiated: null,
			subscriptions: new Set(),
			send: (msg, payload) =>
				writeMessage(socket, msg, payload, outboundBufferCap),
		};
		this.conns.add(conn);

		socket.on("data", (chunk) => {
			try {
				conn.decoder.push(chunk);
				for (const frame of conn.decoder.drain()) {
					this.dispatch(conn, frame.message as ClientMessage, frame.payload);
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

	private dispatch(
		conn: ConnState,
		msg: ClientMessage,
		payload: Uint8Array | null,
	): void {
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
				const reply = handleInput(ctx, msg, payload);
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
			case "prepare-upgrade": {
				// Run the handoff and reply once we know the result. The reply
				// must reach the supervisor before this process exits.
				this.prepareUpgrade()
					.then((result) => {
						conn.send({ type: "upgrade-prepared", result });
					})
					.catch((err) => {
						conn.send({
							type: "upgrade-prepared",
							result: {
								ok: false,
								reason: `prepareUpgrade threw: ${(err as Error).message}`,
							},
						});
					});
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
			spawnPty: this.opts.spawnPty,
		};
	}

	/**
	 * Pipe the session's PTY events into the broadcast set: any connection
	 * subscribed to this session id receives the output / exit frames.
	 */
	private wireSession(session: Session): void {
		session.pty.onData((chunk) => {
			this.store.appendOutput(session, chunk);
			const out: ServerMessage = { type: "output", id: session.id };
			for (const c of this.conns) {
				if (c.subscriptions.has(session.id)) c.send(out, chunk);
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

/**
 * Phase 2: wait for the successor's IPC ack. Resolves with {ok:true} on
 * `upgrade-ack`, with {ok:false} on `upgrade-nak`, child exit, IPC channel
 * close, or timeout.
 */
const HANDOFF_ACK_TIMEOUT_MS = 5_000;
function waitForHandoffAck(
	child: childProcess.ChildProcess,
): Promise<{ ok: true; successorPid: number } | { ok: false; reason: string }> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (
			r: { ok: true; successorPid: number } | { ok: false; reason: string },
		) => {
			if (settled) return;
			settled = true;
			child.removeListener("message", onMessage);
			child.removeListener("exit", onExit);
			child.removeListener("error", onError);
			child.removeListener("disconnect", onDisconnect);
			clearTimeout(timer);
			resolve(r);
		};
		const onMessage = (raw: unknown) => {
			const msg = raw as Partial<HandoffMessage>;
			if (msg && typeof msg === "object" && msg.type === "upgrade-ack") {
				if (
					typeof msg.successorPid !== "number" ||
					!Number.isInteger(msg.successorPid) ||
					msg.successorPid <= 0
				) {
					settle({
						ok: false,
						reason: `successor sent invalid ack pid: ${String(msg.successorPid)}`,
					});
					return;
				}
				settle({ ok: true, successorPid: msg.successorPid });
			} else if (msg && typeof msg === "object" && msg.type === "upgrade-nak") {
				settle({ ok: false, reason: msg.reason ?? "successor sent nak" });
			}
		};
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			settle({
				ok: false,
				reason: `successor exited before ack (code=${code} signal=${signal})`,
			});
		};
		const onError = (err: Error) => {
			settle({
				ok: false,
				reason: `successor spawn error before ack: ${err.message}`,
			});
		};
		const onDisconnect = () => {
			settle({
				ok: false,
				reason: "successor IPC disconnected before ack",
			});
		};
		child.on("message", onMessage);
		child.on("exit", onExit);
		child.on("error", onError);
		child.on("disconnect", onDisconnect);
		const timer = setTimeout(() => {
			settle({
				ok: false,
				reason: `successor ack timed out after ${HANDOFF_ACK_TIMEOUT_MS}ms`,
			});
		}, HANDOFF_ACK_TIMEOUT_MS);
	});
}

function pickProtocol(hello: HelloMessage): number | null {
	const supported = new Set(SUPPORTED_PROTOCOL_VERSIONS);
	let best: number | null = null;
	for (const v of hello.protocols) {
		if (supported.has(v) && (best === null || v > best)) best = v;
	}
	return best;
}

function writeMessage(
	socket: net.Socket,
	msg: ServerMessage,
	payload?: Uint8Array,
	outboundBufferCap = DEFAULT_OUTBOUND_BUFFER_CAP_BYTES,
): void {
	if (socket.destroyed) return;
	if (socket.writableLength > outboundBufferCap) {
		socket.destroy();
		return;
	}
	socket.write(encodeFrame(msg, payload));
	if (socket.writableLength > outboundBufferCap) {
		socket.destroy();
	}
}
