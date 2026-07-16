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
	/** Override inherited-fd adoption in focused handoff tests. */
	adoptPty?: typeof adoptFromFd;
	/** @internal Short timeout override for deterministic staged-recovery tests. */
	stagedRecoveryTimeoutMs?: number;
	/** @internal Process-boundary overrides used only by focused handoff tests. */
	handoffRuntime?: Partial<HandoffRuntime>;
}

const DEFAULT_OUTBOUND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;
const HANDOFF_CHILD_EXIT_TIMEOUT_MS = 2_000;
const HANDOFF_STAGED_RECOVERY_TIMEOUT_MS = 30_000;

type HandoffResult =
	| { ok: true; successorPid: number }
	| {
			ok: false;
			reason: string;
			ownership: "predecessor" | "unresolved";
	  };

type HandoffReadyResult =
	| { ok: true; successorPid: number }
	| { ok: false; reason: string };

/** @internal Exported only to type focused handoff tests. */
export interface HandoffRuntime {
	spawnSuccessor(
		command: string,
		args: string[],
		options: childProcess.SpawnOptions,
	): childProcess.ChildProcess;
	waitForReady(child: childProcess.ChildProcess): Promise<HandoffReadyResult>;
	commitAndWaitForListening(
		child: childProcess.ChildProcess,
		successorPid: number,
	): Promise<HandoffReadyResult>;
	terminateAndConfirm(child: childProcess.ChildProcess): Promise<boolean>;
}

type UpgradePhase = "idle" | "preparing" | "committing";

interface ConnState extends Conn {
	socket: net.Socket;
	decoder: FrameDecoder;
	negotiated: number | null;
}

interface StagedRecoveryOutput {
	chunks: Buffer[];
	bytes: number;
}

export class Server {
	private readonly server: net.Server;
	private readonly store: SessionStore;
	private readonly conns = new Set<ConnState>();
	private readonly opts: ServerOptions;
	private readonly handoffRuntime: HandoffRuntime;
	private readonly stagedSessions = new Set<Session>();
	private readonly stagedRecoveryOutput = new Map<
		string,
		StagedRecoveryOutput
	>();
	private stagedRecoveryTimer: NodeJS.Timeout | null = null;
	private boundSocketPath: string | null = null;
	private listenerClosePromise: Promise<void> | null = null;
	private upgradePhase: UpgradePhase = "idle";
	private mutationEpoch = 0;
	private upgradeDirty = false;

	constructor(opts: ServerOptions) {
		this.opts = opts;
		this.store = new SessionStore({ bufferCap: opts.bufferCap });
		this.server = net.createServer((socket) => this.onConnection(socket));
		this.handoffRuntime = {
			spawnSuccessor: (command, args, options) =>
				childProcess.spawn(command, args, options),
			waitForReady: waitForHandoffReady,
			commitAndWaitForListening,
			terminateAndConfirm: (child) =>
				terminateAndConfirmHandoffChild(child, HANDOFF_CHILD_EXIT_TIMEOUT_MS),
			...opts.handoffRuntime,
		};
	}

	async listen(): Promise<void> {
		await this.listenAt(this.opts.socketPath);
	}

	/** Bind a private successor socket before the predecessor commits. */
	async listenForHandoff(stagingSocketPath: string): Promise<void> {
		if (stagingSocketPath === this.opts.socketPath) {
			throw new Error(
				"handoff staging socket must differ from canonical socket",
			);
		}
		await this.listenAt(stagingSocketPath);
	}

	/**
	 * Atomically publish an already-listening successor at the canonical path.
	 * Existing predecessor connections remain valid on their unlinked listener;
	 * every new connection reaches this successor immediately after rename.
	 */
	publishHandoffSocket(stagingSocketPath: string): void {
		if (this.boundSocketPath !== stagingSocketPath) {
			throw new Error(
				`handoff successor is not listening on ${stagingSocketPath}`,
			);
		}
		unlinkBestEffort(this.opts.socketPath);
		fs.renameSync(stagingSocketPath, this.opts.socketPath);
		this.boundSocketPath = this.opts.socketPath;
		this.scheduleAdoptedSessionRecovery();
	}

	/**
	 * Stop accepting and unlink the predecessor socket without dropping existing
	 * control/data connections. `net.Server.close()` removes a Unix socket path
	 * synchronously, while its callback waits for those connections to drain.
	 */
	private stopListeningForHandoff(): void {
		if (!this.server.listening || this.listenerClosePromise) {
			throw new Error("predecessor listener is not available for handoff");
		}
		this.listenerClosePromise = new Promise<void>((resolve) => {
			this.server.close(() => resolve());
		});
		this.boundSocketPath = null;
	}

	private async listenAt(socketPath: string): Promise<void> {
		const dir = path.dirname(this.opts.socketPath);
		fs.mkdirSync(dir, { recursive: true });
		// Stale-socket cleanup: remove any prior socket file at this path.
		try {
			fs.unlinkSync(socketPath);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
		}
		await new Promise<void>((resolve, reject) => {
			this.server.once("error", reject);
			this.server.listen(socketPath, () => {
				this.server.off("error", reject);
				this.boundSocketPath = socketPath;
				resolve();
			});
		});
		// Owner-only access. The socket file IS the auth boundary.
		fs.chmodSync(socketPath, 0o600);
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
			const pty = (this.opts.adoptPty ?? adoptFromFd)({
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
			session.outputBytes = s.outputBytes ?? s.buffer.byteLength;
			// Do not attach a data listener before commit. The predecessor still
			// owns output until its IPC channel disconnects; a staged successor
			// must leave bytes in the kernel PTY buffer on every abort path.
			this.stagedSessions.add(session);
		}
	}

	/** Replace staged replay buffers with the predecessor's final quiesced cut. */
	refreshAdoptedSnapshot(snapshot: HandoffSnapshot): void {
		if (snapshot.sessions.length !== this.stagedSessions.size) {
			throw new Error(
				`final handoff snapshot session count changed (${snapshot.sessions.length} != ${this.stagedSessions.size})`,
			);
		}
		for (const serialized of snapshot.sessions) {
			const session = this.store.get(serialized.id);
			if (
				!session ||
				!this.stagedSessions.has(session) ||
				session.pty.pid !== serialized.pid
			) {
				throw new Error(
					`final handoff snapshot does not match staged session ${serialized.id}`,
				);
			}
			const buffer = Buffer.from(
				serialized.buffer.buffer,
				serialized.buffer.byteOffset,
				serialized.buffer.byteLength,
			);
			session.buffer = buffer.byteLength > 0 ? [buffer] : [];
			session.bufferBytes = buffer.byteLength;
			session.outputBytes =
				serialized.outputBytes ?? serialized.buffer.byteLength;
		}
	}

	/** Activate every adopted session not already released by subscribe/mutation. */
	activateAdoptedSessions(): number {
		const count = this.stagedSessions.size;
		for (const session of [...this.stagedSessions]) {
			this.activateStagedSession(session.id);
		}
		return count;
	}

	/**
	 * A committed successor cannot leave inherited PTY readers paused forever if
	 * host-service dies before its ordered subscribe/activate sequence. The
	 * recovery cut contains only bytes read after this fallback activates, so a
	 * late live-rotation subscribe (`replay:false`) receives the stranded suffix
	 * without replaying the predecessor snapshot that its renderer already has.
	 */
	scheduleAdoptedSessionRecovery(): void {
		if (this.stagedSessions.size === 0 || this.stagedRecoveryTimer) return;
		const timeoutMs =
			this.opts.stagedRecoveryTimeoutMs ?? HANDOFF_STAGED_RECOVERY_TIMEOUT_MS;
		this.stagedRecoveryTimer = setTimeout(() => {
			this.stagedRecoveryTimer = null;
			for (const session of [...this.stagedSessions]) {
				this.activateStagedSession(session.id, true);
			}
		}, timeoutMs);
		this.stagedRecoveryTimer.unref();
	}

	/**
	 * Phase 2 handoff (sender): spawn a successor process, hand it the live
	 * PTY master fds via stdio inheritance, await its ack, then exit.
	 *
	 * The daemon process running this method exits on success; callers get
	 * a single Promise resolution (or rejection) for the supervisor to relay
	 * back to the user.
	 */
	async prepareUpgrade(): Promise<HandoffResult> {
		if (this.upgradePhase !== "idle") {
			return {
				ok: false,
				reason: `upgrade already ${this.upgradePhase}`,
				ownership: "unresolved",
			};
		}

		// An async function executes synchronously until its first await. Set the
		// guard before even snapshotting the store so no new mutation can sneak
		// into the handoff candidate set.
		this.upgradePhase = "preparing";
		this.upgradeDirty = false;
		const startEpoch = this.mutationEpoch;
		const liveSessions = [...this.store.all()].filter((s) => !s.exited);
		const preparedPtys: Session["pty"][] = [];
		let handoffCommitted = false;
		let predecessorMayResume = true;
		let child: childProcess.ChildProcess | null = null;
		let snapshotPath: string | null = null;
		let stagingSocketPath: string | null = null;
		let commitSent = false;

		try {
			try {
				for (const session of liveSessions) {
					preparedPtys.push(session.pty);
				}
				await Promise.all(preparedPtys.map((pty) => pty.prepareForHandoff()));
			} catch (err) {
				return {
					ok: false,
					reason: `PTY input drain failed before handoff: ${(err as Error).message}`,
					ownership: "predecessor",
				};
			}
			if (this.upgradeWasMutated(startEpoch)) {
				return {
					ok: false,
					reason:
						"upgrade aborted: terminal mutation arrived while input was draining",
					ownership: "predecessor",
				};
			}

			// Establish one exact output cut before serializing replay state. From
			// this point onward the predecessor consumes no PTY bytes: output remains
			// in the kernel for the successor on commit, or for us after a safe abort.
			try {
				for (const pty of preparedPtys) pty.pauseOutputForHandoff();
			} catch (err) {
				return {
					ok: false,
					reason: `PTY output quiescence failed before handoff: ${(err as Error).message}`,
					ownership: "predecessor",
				};
			}
			// pause() reaches libuv synchronously, but a read callback already queued
			// for this turn can still land in Node's user-space Readable buffer. Let
			// that callback settle, drain it into the predecessor ring/broadcast, and
			// only then serialize the exact replay boundary.
			await new Promise((resolve) => setImmediate(resolve));
			try {
				for (const session of liveSessions) {
					for (const chunk of await session.pty.drainOutputForHandoff()) {
						this.recordSessionOutput(session, chunk);
					}
				}
			} catch (err) {
				return {
					ok: false,
					reason: `PTY buffered-output drain failed before handoff: ${(err as Error).message}`,
					ownership: "predecessor",
				};
			}
			if (this.upgradeWasMutated(startEpoch)) {
				return {
					ok: false,
					reason:
						"upgrade aborted: terminal mutation arrived while output was quiescing",
					ownership: "predecessor",
				};
			}

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

			snapshotPath = path.join(
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
					ownership: "predecessor",
				};
			}
			if (this.upgradeWasMutated(startEpoch)) {
				return {
					ok: false,
					reason:
						"upgrade aborted: terminal mutation arrived before successor spawn",
					ownership: "predecessor",
				};
			}

			// process.argv[1] is the daemon script path. The supervisor that
			// originally spawned us decided that path; for an upgrade, the bundle
			// at that path has already been replaced by the desktop installer
			// (or a dev rebuild), so spawning it again loads the new bytecode.
			const scriptPath = process.argv[1];
			if (!scriptPath) {
				return {
					ok: false,
					reason: "process.argv[1] empty — can't self-spawn",
					ownership: "predecessor",
				};
			}
			stagingSocketPath = path.join(
				path.dirname(this.opts.socketPath),
				`.ptyd-h-${process.pid}-${Date.now().toString(36)}.sock`,
			);

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
			try {
				child = this.handoffRuntime.spawnSuccessor(
					process.execPath,
					[
						...process.execArgv,
						scriptPath,
						"--handoff",
						`--snapshot=${snapshotPath}`,
						`--socket=${this.opts.socketPath}`,
						`--handoff-socket=${stagingSocketPath}`,
					],
					{
						stdio,
						env: successorEnv,
						detached: false,
					},
				);
			} catch (err) {
				return {
					ok: false,
					reason: `successor spawn failed: ${(err as Error).message}`,
					ownership: "predecessor",
				};
			}
			// child_process stdio inheritance has now shared the PTY open-file
			// descriptions. Never unfreeze the predecessor until this exact child is
			// confirmed dead, or until ownership commits to it.
			predecessorMayResume = false;
			child.on("exit", (code, signal) => {
				process.stderr.write(
					`[pty-daemon prep-upgrade pid=${process.pid}] successor exited code=${code} signal=${signal}\n`,
				);
			});

			const ready = await this.handoffRuntime.waitForReady(child);
			if (!ready.ok) {
				predecessorMayResume =
					await this.handoffRuntime.terminateAndConfirm(child);
				return {
					ok: false,
					reason: predecessorMayResume
						? ready.reason
						: `${ready.reason}; successor exit could not be confirmed — predecessor remains frozen`,
					ownership: predecessorMayResume ? "predecessor" : "unresolved",
				};
			}

			// Passing the shared fd through child_process stdio can complete one
			// already-armed predecessor read after the initial snapshot. READY has
			// given that read ample turns to settle; fold any such bytes into an
			// atomic final snapshot that the successor reloads on COMMIT.
			await new Promise((resolve) => setImmediate(resolve));
			try {
				for (const session of liveSessions) {
					for (const chunk of await session.pty.drainOutputForHandoff()) {
						this.recordSessionOutput(session, chunk);
					}
				}
			} catch (error) {
				predecessorMayResume =
					await this.handoffRuntime.terminateAndConfirm(child);
				return {
					ok: false,
					reason: `final PTY output drain failed: ${(error as Error).message}`,
					ownership: predecessorMayResume ? "predecessor" : "unresolved",
				};
			}

			if (this.upgradeWasMutated(startEpoch)) {
				predecessorMayResume =
					await this.handoffRuntime.terminateAndConfirm(child);
				return {
					ok: false,
					reason: predecessorMayResume
						? "upgrade aborted: terminal mutation arrived before commit"
						: "upgrade aborted after mutation, but successor exit could not be confirmed — predecessor remains frozen",
					ownership: predecessorMayResume ? "predecessor" : "unresolved",
				};
			}
			// READY proves staged adoption plus a private listening socket, not
			// ownership. No await is allowed between the final epoch check and this
			// phase transition. From here on abort is unsafe: permanently detaching
			// predecessor readers creates a hard byte boundary, after which COMMIT
			// lets the successor publish its already-listening canonical socket.
			this.upgradePhase = "committing";
			commitSent = true;
			predecessorMayResume = false;
			for (const session of liveSessions) {
				for (const chunk of await session.pty.sealOutputForHandoff()) {
					this.recordSessionOutput(session, chunk);
				}
			}
			writeSnapshot(
				snapshotPath,
				serializeSessions({ sessions: liveSessions, fdIndexBySessionId }),
			);
			this.stopListeningForHandoff();
			const listening = await this.handoffRuntime.commitAndWaitForListening(
				child,
				ready.successorPid,
			);
			if (!listening.ok) {
				// Once COMMIT may have reached the successor, it may already have read
				// kernel-buffered output. Even confirmed child death cannot make replay
				// complete again, so the predecessor must remain fail-closed.
				predecessorMayResume = false;
				await this.handoffRuntime.terminateAndConfirm(child).catch(() => false);
				return {
					ok: false,
					reason: `${listening.reason}; successor ownership after commit is unresolved — predecessor remains frozen`,
					ownership: "unresolved",
				};
			}

			// The canonical socket now belongs to this exact child. Its PTY readers
			// remain staged until the host subscribes, then explicitly releases any
			// orphan/hidden sessions after all known rebinds. Only now is it safe to
			// report success and exit.
			handoffCommitted = true;
			setImmediate(() => {
				void this.finalizeHandoff();
			});
			return { ok: true, successorPid: listening.successorPid };
		} catch (error) {
			if (child && !handoffCommitted) {
				if (commitSent) {
					predecessorMayResume = false;
					await this.handoffRuntime
						.terminateAndConfirm(child)
						.catch(() => false);
				} else {
					try {
						predecessorMayResume =
							await this.handoffRuntime.terminateAndConfirm(child);
					} catch {
						predecessorMayResume = false;
					}
				}
			}
			return {
				ok: false,
				reason: `prepareUpgrade failed: ${(error as Error).message}${
					predecessorMayResume
						? ""
						: "; successor exit could not be confirmed — predecessor remains frozen"
				}`,
				ownership: predecessorMayResume ? "predecessor" : "unresolved",
			};
		} finally {
			if (!handoffCommitted) {
				if (snapshotPath) unlinkBestEffort(snapshotPath);
				if (stagingSocketPath && predecessorMayResume) {
					unlinkBestEffort(stagingSocketPath);
				}
				if (predecessorMayResume) {
					const restored = new Set<Session["pty"]>();
					for (const session of liveSessions) {
						try {
							session.pty.restoreAfterFailedHandoff();
							restored.add(session.pty);
						} catch (error) {
							process.stderr.write(
								`[pty-daemon prep-upgrade pid=${process.pid}] failed to restore PTY ${session.id} nonblocking mode: ${(error as Error).message}\n`,
							);
						}
					}
					// Restoration must happen before unfreeze. A PTY whose restore
					// failed has already failed closed and must not accept input.
					for (const pty of preparedPtys) {
						if (restored.has(pty)) pty.cancelHandoff();
					}
					this.upgradePhase = "idle";
				} else {
					// Readers may have been permanently sealed. Touching their fd or
					// resuming them here would turn a safe fail-closed state into data
					// loss or a daemon-wide blocking read.
					process.stderr.write(
						`[pty-daemon prep-upgrade pid=${process.pid}] successor ownership unresolved; keeping predecessor PTY input/output frozen\n`,
					);
				}
			}
		}
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
		await this.close({ killSessions: false, unlinkSocket: false });
		setTimeout(() => process.exit(0), 50).unref();
	}

	async close(
		opts: { killSessions?: boolean; unlinkSocket?: boolean } = {},
	): Promise<void> {
		const killSessions = opts.killSessions ?? true;
		const unlinkSocket = opts.unlinkSocket ?? true;
		if (this.stagedRecoveryTimer) {
			clearTimeout(this.stagedRecoveryTimer);
			this.stagedRecoveryTimer = null;
		}
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
		if (this.listenerClosePromise) {
			await this.listenerClosePromise;
		} else if (this.server.listening) {
			await new Promise<void>((resolve) => this.server.close(() => resolve()));
		}
		if (unlinkSocket && this.boundSocketPath) {
			try {
				fs.unlinkSync(this.boundSocketPath);
			} catch {
				// ignore
			}
		}
		this.boundSocketPath = null;
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
			this.dropConn(conn);
		});
		socket.on("error", () => {
			this.dropConn(conn);
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
				daemonPid: process.pid,
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
				if (this.rejectMutationDuringUpgrade(conn, msg.id)) return;
				conn.send(handleOpen(ctx, msg));
				return;
			}
			case "input": {
				if (this.rejectMutationDuringUpgrade(conn, msg.id)) return;
				this.activateStagedSession(msg.id);
				const reply = handleInput(ctx, msg, payload);
				if (reply) conn.send(reply);
				return;
			}
			case "resize": {
				if (this.rejectMutationDuringUpgrade(conn, msg.id)) return;
				this.activateStagedSession(msg.id);
				const reply = handleResize(ctx, msg);
				if (reply) conn.send(reply);
				return;
			}
			case "close": {
				if (this.rejectMutationDuringUpgrade(conn, msg.id)) return;
				this.activateStagedSession(msg.id);
				conn.send(handleClose(ctx, msg));
				return;
			}
			case "list": {
				conn.send(handleList(ctx));
				return;
			}
			case "subscribe": {
				// Register the subscription and send the final predecessor replay cut
				// before attaching the successor reader. Any bytes queued in the PTY
				// kernel buffer then arrive as live output exactly once.
				handleSubscribe(ctx, conn, msg);
				this.sendStagedRecoveryOutput(conn, msg.id, msg.replay);
				this.activateStagedSession(msg.id);
				return;
			}
			case "unsubscribe": {
				handleUnsubscribe(conn, msg);
				return;
			}
			case "activate-adopted": {
				// This frame follows all known subscription rebinds on the same ordered
				// socket. Subscribed sessions are already active, so only orphan/hidden
				// readers remain for this explicit release.
				conn.send({
					type: "adopted-activated",
					count: this.activateAdoptedSessions(),
				});
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
								ownership: "unresolved",
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

	private rejectMutationDuringUpgrade(conn: ConnState, id: string): boolean {
		if (this.upgradePhase === "idle") return false;
		if (this.upgradePhase === "preparing") {
			this.mutationEpoch += 1;
			this.upgradeDirty = true;
		}
		conn.send({
			type: "error",
			id,
			code: "EUPGRADING",
			message: `terminal mutation rejected while daemon upgrade is ${this.upgradePhase}; retry on the active daemon`,
		});
		return true;
	}

	private upgradeWasMutated(startEpoch: number): boolean {
		return this.upgradeDirty || this.mutationEpoch !== startEpoch;
	}

	private activateStagedSession(id: string, recoverOutput = false): void {
		const session = this.store.get(id);
		if (!session || !this.stagedSessions.delete(session)) return;
		if (recoverOutput) {
			this.stagedRecoveryOutput.set(id, {
				chunks: [],
				bytes: 0,
			});
		}
		this.wireSession(session);
		if (this.stagedSessions.size === 0 && this.stagedRecoveryTimer) {
			clearTimeout(this.stagedRecoveryTimer);
			this.stagedRecoveryTimer = null;
		}
	}

	private sendStagedRecoveryOutput(
		conn: ConnState,
		id: string,
		replay: boolean,
	): void {
		const recovery = this.stagedRecoveryOutput.get(id);
		if (!recovery) return;
		// The connection is already registered as a subscriber. Delete the bounded
		// cut before sending it; output arriving afterward is broadcast live and the
		// recovery buffer cannot linger for the lifetime of the shell.
		this.stagedRecoveryOutput.delete(id);
		// replay=true already emitted the daemon's full ring, including this cut.
		if (replay || recovery.bytes === 0) return;
		conn.send(
			{ type: "output", id },
			Buffer.concat(recovery.chunks, recovery.bytes),
		);
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
		session.pty.onData((chunk) => this.recordSessionOutput(session, chunk));
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
			this.stagedRecoveryOutput.delete(session.id);
			this.store.delete(session.id);
		});
	}

	private recordSessionOutput(session: Session, chunk: Buffer): void {
		this.store.appendOutput(session, chunk);
		const recovery = this.stagedRecoveryOutput.get(session.id);
		if (recovery) {
			const copy = Buffer.from(chunk);
			recovery.chunks.push(copy);
			recovery.bytes += copy.byteLength;
			while (recovery.bytes > session.bufferCap && recovery.chunks.length > 0) {
				const head = recovery.chunks.shift();
				if (head) recovery.bytes -= head.byteLength;
			}
		}
		const out: ServerMessage = { type: "output", id: session.id };
		for (const c of this.conns) {
			if (!c.subscriptions.has(session.id)) continue;
			c.send(out, chunk);
		}
	}

	private dropConn(conn: ConnState): void {
		this.conns.delete(conn);
	}
}

function unlinkBestEffort(filePath: string): void {
	try {
		fs.unlinkSync(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			process.stderr.write(
				`[pty-daemon prep-upgrade pid=${process.pid}] snapshot cleanup failed: ${(error as Error).message}\n`,
			);
		}
	}
}

async function terminateAndConfirmHandoffChild(
	child: childProcess.ChildProcess,
	timeoutMs: number,
): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return true;

	return await new Promise<boolean>((resolve) => {
		let settled = false;
		let timer: NodeJS.Timeout | null = null;
		const settle = (confirmed: boolean) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			child.removeListener("exit", onExit);
			child.removeListener("error", onError);
			resolve(confirmed);
		};
		const onExit = () => settle(true);
		const onError = () => {
			// An asynchronous spawn error with no pid proves that no successor
			// process ever inherited ownership. With a pid, only exit is proof.
			if (child.pid === undefined) settle(true);
		};

		child.once("exit", onExit);
		child.once("error", onError);
		timer = setTimeout(
			() => settle(child.exitCode !== null || child.signalCode !== null),
			timeoutMs,
		);
		try {
			child.kill("SIGKILL");
		} catch {
			// ESRCH can race the exit event. The bounded waiter still requires the
			// ChildProcess to report exit before predecessor input is unfrozen.
		}
	});
}

/** Wait until the successor has adopted every fd and bound a private socket. */
const HANDOFF_READY_TIMEOUT_MS = 5_000;
function waitForHandoffReady(
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
			if (msg && typeof msg === "object" && msg.type === "upgrade-ready") {
				if (
					typeof msg.successorPid !== "number" ||
					!Number.isInteger(msg.successorPid) ||
					msg.successorPid <= 0 ||
					(child.pid !== undefined && msg.successorPid !== child.pid)
				) {
					settle({
						ok: false,
						reason: `successor sent invalid ready pid: ${String(msg.successorPid)}`,
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
				reason: `successor exited before ready (code=${code} signal=${signal})`,
			});
		};
		const onError = (err: Error) => {
			settle({
				ok: false,
				reason: `successor spawn error before ready: ${err.message}`,
			});
		};
		const onDisconnect = () => {
			settle({
				ok: false,
				reason: "successor IPC disconnected before ready",
			});
		};
		child.on("message", onMessage);
		child.on("exit", onExit);
		child.on("error", onError);
		child.on("disconnect", onDisconnect);
		const timer = setTimeout(() => {
			settle({
				ok: false,
				reason: `successor ready timed out after ${HANDOFF_READY_TIMEOUT_MS}ms`,
			});
		}, HANDOFF_READY_TIMEOUT_MS);
	});
}

/** Send COMMIT and require proof that the exact child owns the canonical socket. */
const HANDOFF_LISTENING_TIMEOUT_MS = 5_000;
function commitAndWaitForListening(
	child: childProcess.ChildProcess,
	successorPid: number,
): Promise<{ ok: true; successorPid: number } | { ok: false; reason: string }> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (
			result:
				| { ok: true; successorPid: number }
				| { ok: false; reason: string },
		) => {
			if (settled) return;
			settled = true;
			child.removeListener("message", onMessage);
			child.removeListener("exit", onExit);
			child.removeListener("error", onError);
			child.removeListener("disconnect", onDisconnect);
			clearTimeout(timer);
			resolve(result);
		};
		const onMessage = (raw: unknown) => {
			const msg = raw as Partial<HandoffMessage>;
			if (msg && typeof msg === "object" && msg.type === "upgrade-listening") {
				if (msg.successorPid !== successorPid) {
					settle({
						ok: false,
						reason: `successor listening pid mismatch: expected ${successorPid}, got ${String(msg.successorPid)}`,
					});
					return;
				}
				settle({ ok: true, successorPid });
			} else if (msg && typeof msg === "object" && msg.type === "upgrade-nak") {
				settle({ ok: false, reason: msg.reason ?? "successor sent nak" });
			}
		};
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			settle({
				ok: false,
				reason: `successor exited after commit before listening (code=${code} signal=${signal})`,
			});
		};
		const onError = (error: Error) => {
			settle({
				ok: false,
				reason: `successor error after commit: ${error.message}`,
			});
		};
		const onDisconnect = () => {
			settle({
				ok: false,
				reason: "successor IPC disconnected after commit before listening",
			});
		};

		child.on("message", onMessage);
		child.on("exit", onExit);
		child.on("error", onError);
		child.on("disconnect", onDisconnect);
		const timer = setTimeout(
			() =>
				settle({
					ok: false,
					reason: `successor listening proof timed out after ${HANDOFF_LISTENING_TIMEOUT_MS}ms`,
				}),
			HANDOFF_LISTENING_TIMEOUT_MS,
		);

		try {
			const commit: HandoffMessage = { type: "upgrade-commit" };
			child.send(commit, (error) => {
				if (error) {
					settle({
						ok: false,
						reason: `failed to send successor commit: ${error.message}`,
					});
				}
			});
		} catch (error) {
			settle({
				ok: false,
				reason: `failed to send successor commit: ${(error as Error).message}`,
			});
		}
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
