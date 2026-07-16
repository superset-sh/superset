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
	CORRELATED_INPUT_ACK_CAPABILITY,
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
	type SessionInfo,
	type SessionMeta,
} from "@superset/pty-daemon/protocol";
import semver from "semver";

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

export type UpgradePreparedResult =
	| { ok: true; successorPid: number }
	| {
			ok: false;
			reason: string;
			/**
			 * Absent only when talking to a pre-transaction legacy daemon. Missing
			 * ownership is ambiguous and must never be interpreted as a safe abort.
			 */
			ownership?: "predecessor" | "unresolved";
	  };

export interface ReplayBoundary {
	/** Exact daemon replay size, or null when connected to a pre-ACK daemon. */
	replayBytes: number | null;
	/** Absolute replay cursors; null when connected to a pre-cursor daemon. */
	replayStartBytes?: number | null;
	replayEndBytes?: number | null;
}

interface SessionCallbacks {
	output: Set<(chunk: Buffer) => void>;
	exit: Set<(info: ExitInfo) => void>;
}

export interface DaemonClientOptions {
	socketPath: string;
	connectTimeoutMs?: number;
	inputAckTimeoutMs?: number;
}

export type DaemonInputFailureOutcome = "definitive-reject" | "outcome-unknown";

/**
 * A typed input failure. Only `definitive-reject` proves the daemon rejected
 * this exact payload before PTY enqueue; `outcome-unknown` means it may have
 * reached the PTY before transport certainty was lost.
 */
export class DaemonInputError extends Error {
	readonly outcome: DaemonInputFailureOutcome;
	readonly inputId: string;
	readonly sequence: number;
	readonly code?: string;

	constructor(options: {
		message: string;
		outcome: DaemonInputFailureOutcome;
		inputId: string;
		sequence: number;
		code?: string;
	}) {
		super(options.message);
		this.name = "DaemonInputError";
		this.outcome = options.outcome;
		this.inputId = options.inputId;
		this.sequence = options.sequence;
		this.code = options.code;
	}
}

/**
 * Per-request timeouts. The daemon should respond within milliseconds for
 * close/list, and within a few seconds for open (PTY spawn includes shell
 * startup). Without these, a live-but-stuck daemon can hang callers
 * indefinitely — a real risk if `node-pty.spawn` ever blocks.
 */
const OPEN_TIMEOUT_MS = 15_000;
// The daemon intentionally holds the reply until its bounded (5s) descendant
// escalation drain settles. Keep client-side headroom for scheduling and I/O.
const CLOSE_TIMEOUT_MS = 7_000;
const LIST_TIMEOUT_MS = 5_000;
const SUBSCRIBE_TIMEOUT_MS = 5_000;
const SUBSCRIBED_ACK_MIN_DAEMON_VERSION = "0.2.6";
const ACTIVATE_ADOPTED_TIMEOUT_MS = 5_000;
// Daemon-side handoff has to write a snapshot, spawn a child Node process,
// await successor adopt-ack, then reply. The Server uses 5s for the ack
// alone; 15s here covers spawn + ack + reply round-trip with margin.
const PREPARE_UPGRADE_TIMEOUT_MS = 15_000;
const INPUT_ACK_TIMEOUT_MS = 5_000;

interface PendingInput {
	id: string;
	resolve: () => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

export class DaemonClient {
	private readonly opts: DaemonClientOptions;
	private socket: net.Socket | null = null;
	private decoder = new FrameDecoder();
	private readonly callbacks = new Map<string, SessionCallbacks>();
	private readonly disconnectCbs = new Set<(err?: Error) => void>();
	private daemonVersion = "";
	private daemonCapabilities = new Set<string>();
	private negotiated: number | null = null;
	private connected = false;
	private disposePromise: Promise<void> | null = null;
	private nextInputSequence = 1;
	private readonly pendingInputs = new Map<number, PendingInput>();
	private readonly inputAckTimeoutMs: number;
	/**
	 * Protocol v1 has no request ids for list/prepare-upgrade replies. Keep
	 * non-session requests strictly serialized so an older concurrent list reply
	 * cannot satisfy the handoff barrier that was sent later.
	 */
	private nonSessionTail: Promise<void> = Promise.resolve();

	constructor(opts: DaemonClientOptions) {
		this.opts = opts;
		this.inputAckTimeoutMs = opts.inputAckTimeoutMs ?? INPUT_ACK_TIMEOUT_MS;
		if (
			!Number.isInteger(this.inputAckTimeoutMs) ||
			this.inputAckTimeoutMs <= 0
		) {
			throw new Error(
				`DaemonClient: invalid input ACK timeout ${this.inputAckTimeoutMs}`,
			);
		}
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

	hasCapability(capability: string): boolean {
		return this.daemonCapabilities.has(capability);
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
		return this.serializeNonSession(async () => {
			const reply = await this.requestNonSession(
				{ type: "list" },
				"list-reply",
				LIST_TIMEOUT_MS,
			);
			if (reply.type === "list-reply") {
				return validateSessionList((reply as { sessions?: unknown }).sessions);
			}
			throw new Error(`list: unexpected reply ${reply.type}`);
		});
	}

	/**
	 * Release adopted readers left staged after handoff. The host calls this only
	 * after known subscriptions were rebound on this same ordered socket.
	 */
	async activateAdopted(): Promise<number> {
		return this.serializeNonSession(async () => {
			const reply = await this.requestNonSession(
				{ type: "activate-adopted" },
				"adopted-activated",
				ACTIVATE_ADOPTED_TIMEOUT_MS,
			);
			if (reply.type === "adopted-activated") return reply.count;
			if (reply.type === "error") {
				throw new Error(`activate-adopted: ${reply.message}`);
			}
			throw new Error(`activate-adopted: unexpected reply ${reply.type}`);
		});
	}

	/**
	 * Phase 2: ask the daemon to spawn a successor process that inherits PTY
	 * master fds and adopts all live sessions. On success the daemon exits
	 * shortly after replying — this client's connection will close.
	 *
	 * Timeout is generous: the daemon has to write a snapshot, spawn a child
	 * Node process, wait for the successor's adopt+ack, then reply.
	 */
	async prepareUpgrade(): Promise<UpgradePreparedResult> {
		return this.serializeNonSession(async () => {
			const reply = await this.requestNonSession(
				{ type: "prepare-upgrade" },
				"upgrade-prepared",
				PREPARE_UPGRADE_TIMEOUT_MS,
			);
			if (reply.type === "upgrade-prepared") {
				// The workspace package's generated declaration can lag its source
				// during a local multi-package build. New daemons carry the ownership
				// discriminator; legacy protocol-v1 daemons may omit it, which the
				// optional compatibility type deliberately preserves as ambiguous.
				return reply.result as UpgradePreparedResult;
			}
			if (reply.type === "error")
				throw new Error(`prepare-upgrade: ${reply.message}`);
			throw new Error(`prepare-upgrade: unexpected reply ${reply.type}`);
		});
	}

	/** Resolve once this exact payload is accepted, or reject its correlated error. */
	input(id: string, data: Buffer): Promise<void> {
		// Bytes ride in the frame's binary tail (see ../../protocol/framing.ts).
		// No base64 hop on either side.
		if (!this.hasCapability(CORRELATED_INPUT_ACK_CAPABILITY)) {
			// Preserve the original wire shape for a legacy daemon. A same-socket list
			// barrier still protects rotation, but ordinary input must never wait for an
			// ACK the peer cannot emit.
			try {
				this.send({ type: "input", id }, data);
				return Promise.resolve();
			} catch (error) {
				return Promise.reject(
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}

		const sequence = this.allocateInputSequence();
		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingInputs.delete(sequence);
				reject(
					new DaemonInputError({
						message: `daemon input ${id} sequence ${sequence}: timed out after ${this.inputAckTimeoutMs}ms; payload outcome is unknown`,
						outcome: "outcome-unknown",
						inputId: id,
						sequence,
					}),
				);
			}, this.inputAckTimeoutMs);
			timer.unref();
			this.pendingInputs.set(sequence, { id, resolve, reject, timer });
			try {
				this.send({ type: "input", id, sequence }, data);
			} catch (error) {
				this.settleInput(
					sequence,
					new DaemonInputError({
						message: `daemon input ${id} sequence ${sequence}: transport failed before acknowledgement: ${error instanceof Error ? error.message : String(error)}; payload outcome is unknown`,
						outcome: "outcome-unknown",
						inputId: id,
						sequence,
					}),
				);
			}
		});
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
			this.send({
				type: "subscribe",
				id,
				replay: opts.replay,
			});
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

	/**
	 * Subscribe and expose an ordered replay boundary. New daemons emit a
	 * `subscribed` ACK after their optional replay frame with its exact byte
	 * count. The immediately-following list request is a barrier on the same
	 * socket, so by the time it resolves all replay callbacks have run. Older
	 * daemons omit the ACK; callers receive `null` and can classify the ordered
	 * callback bytes with a compatibility fallback.
	 */
	subscribeWithReplayBoundary(
		id: string,
		opts: { replay: boolean },
		cb: SubscribeCallbacks,
	): { unsubscribe: () => void; boundary: Promise<ReplayBoundary> } {
		const expectsAck = daemonSupportsSubscribedAck(this.daemonVersion);
		let replayBytes: number | null = null;
		let replayStartBytes: number | null = null;
		let replayEndBytes: number | null = null;
		let subscriptionError: Error | null = null;
		let resolveAck: ((value: ReplayBoundary) => void) | null = null;
		let rejectAck: ((error: Error) => void) | null = null;
		const ackBoundary = expectsAck
			? new Promise<ReplayBoundary>((resolve, reject) => {
					resolveAck = resolve;
					rejectAck = reject;
				})
			: null;
		const offAck = this.on((message) => {
			if (message.type === "error" && message.id === id) {
				const code = message.code ? ` (${message.code})` : "";
				subscriptionError = new Error(
					`subscribe ${id}${code}: ${message.message}`,
				);
				rejectAck?.(subscriptionError);
				return;
			}
			if (message.type === "subscribed" && message.id === id) {
				if (
					!Number.isSafeInteger(message.replayBytes) ||
					message.replayBytes < 0
				) {
					subscriptionError = new Error(
						`subscribe ${id}: invalid replay byte count ${message.replayBytes}`,
					);
					rejectAck?.(subscriptionError);
					return;
				}
				replayBytes = message.replayBytes;
				if (
					Number.isSafeInteger(message.replayStartBytes) &&
					Number.isSafeInteger(message.replayEndBytes) &&
					(message.replayStartBytes ?? -1) >= 0 &&
					(message.replayEndBytes ?? -1) >= (message.replayStartBytes ?? 0) &&
					(message.replayEndBytes ?? 0) - (message.replayStartBytes ?? 0) ===
						message.replayBytes
				) {
					replayStartBytes = message.replayStartBytes ?? null;
					replayEndBytes = message.replayEndBytes ?? null;
				}
				resolveAck?.({ replayBytes, replayStartBytes, replayEndBytes });
			}
		});
		const offDisconnect = expectsAck
			? this.onDisconnect((error) =>
					rejectAck?.(error ?? new Error("daemon disconnected")),
				)
			: null;
		const ackTimer = expectsAck
			? setTimeout(
					() =>
						rejectAck?.(
							new Error(
								`subscribe ${id}: timed out after ${SUBSCRIBE_TIMEOUT_MS}ms`,
							),
						),
					SUBSCRIBE_TIMEOUT_MS,
				)
			: null;
		ackTimer?.unref();
		const cleanupBoundary = () => {
			offAck();
			offDisconnect?.();
			if (ackTimer) clearTimeout(ackTimer);
		};

		let unsubscribe: () => void;
		try {
			unsubscribe = this.subscribe(id, opts, cb);
		} catch (error) {
			cleanupBoundary();
			throw error;
		}

		const boundary = (
			ackBoundary ??
			this.list().then((sessions) => {
				if (subscriptionError) throw subscriptionError;
				if (!sessions.some((session) => session.id === id && session.alive)) {
					throw new Error(
						`subscribe ${id} (EEXITED): session exited before replay boundary`,
					);
				}
				return { replayBytes, replayStartBytes, replayEndBytes };
			})
		).finally(cleanupBoundary);
		return { unsubscribe, boundary };
	}

	async dispose(): Promise<void> {
		if (this.disposePromise) return this.disposePromise;
		this.connected = false;
		this.rejectPendingInputsUnknown(
			"DaemonClient disposed before input acknowledgement",
		);
		const sock = this.socket;
		this.socket = null;
		if (!sock || sock.closed) return;
		const closePromise = new Promise<void>((resolve) => {
			let settled = false;
			let forceDestroyTimer: ReturnType<typeof setTimeout> | null = null;
			const settleAfterClose = () => {
				if (settled) return;
				settled = true;
				if (forceDestroyTimer) clearTimeout(forceDestroyTimer);
				sock.off("close", settleAfterClose);
				resolve();
			};
			sock.once("close", settleAfterClose);
			if (sock.closed) {
				settleAfterClose();
				return;
			}
			forceDestroyTimer = setTimeout(() => {
				if (!sock.closed) sock.destroy();
			}, 200);
			if (!sock.destroyed) sock.end();
		});
		this.disposePromise = closePromise;
		try {
			await closePromise;
		} finally {
			if (this.disposePromise === closePromise) this.disposePromise = null;
		}
	}

	// ---- Internals ----

	private serializeNonSession<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.nonSessionTail.then(operation, operation);
		this.nonSessionTail = result.then(
			() => {},
			() => {},
		);
		return result;
	}

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
		this.daemonCapabilities = new Set(
			Array.isArray(ack.capabilities)
				? ack.capabilities.filter(
						(capability): capability is string =>
							typeof capability === "string",
					)
				: [],
		);
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
		req:
			| { type: "list" }
			| { type: "prepare-upgrade" }
			| { type: "activate-adopted" },
		expectType: "list-reply" | "upgrade-prepared" | "adopted-activated",
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

	private allocateInputSequence(): number {
		const sequence = this.nextInputSequence;
		if (!Number.isSafeInteger(sequence) || sequence <= 0) {
			throw new Error("DaemonClient: input sequence exhausted");
		}
		this.nextInputSequence += 1;
		return sequence;
	}

	private settleInput(sequence: number, error?: unknown): boolean {
		const pending = this.pendingInputs.get(sequence);
		if (!pending) return false;
		this.pendingInputs.delete(sequence);
		clearTimeout(pending.timer);
		if (error === undefined) pending.resolve();
		else {
			pending.reject(error instanceof Error ? error : new Error(String(error)));
		}
		return true;
	}

	private rejectPendingInputsUnknown(message: string): void {
		for (const [sequence, pending] of [...this.pendingInputs.entries()]) {
			this.settleInput(
				sequence,
				new DaemonInputError({
					message: `${message}; daemon input ${pending.id} sequence ${sequence} may have reached the PTY`,
					outcome: "outcome-unknown",
					inputId: pending.id,
					sequence,
				}),
			);
		}
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
			if (msg.type === "input-ack") {
				const pending = this.pendingInputs.get(msg.sequence);
				if (pending && pending.id !== msg.id) {
					this.settleInput(
						msg.sequence,
						new DaemonInputError({
							message: `daemon input acknowledgement protocol mismatch: sequence ${msg.sequence} named ${msg.id}, expected ${pending.id}; payload outcome is unknown`,
							outcome: "outcome-unknown",
							inputId: pending.id,
							sequence: msg.sequence,
						}),
					);
				} else {
					this.settleInput(msg.sequence);
				}
				continue;
			}
			if (msg.type === "error" && msg.inputSequence !== undefined) {
				const pending = this.pendingInputs.get(msg.inputSequence);
				if (pending) {
					const code = msg.code ? ` (${msg.code})` : "";
					if (msg.id !== pending.id) {
						this.settleInput(
							msg.inputSequence,
							new DaemonInputError({
								message: `daemon input error protocol mismatch: sequence ${msg.inputSequence} named ${msg.id ?? "unknown"}, expected ${pending.id}; payload outcome is unknown`,
								outcome: "outcome-unknown",
								inputId: pending.id,
								sequence: msg.inputSequence,
								code: msg.code,
							}),
						);
					} else if (msg.inputOutcome === "not-enqueued") {
						this.settleInput(
							msg.inputSequence,
							new DaemonInputError({
								message: `input ${msg.id} sequence ${msg.inputSequence}${code}: ${msg.message}`,
								outcome: "definitive-reject",
								inputId: pending.id,
								sequence: msg.inputSequence,
								code: msg.code,
							}),
						);
					} else {
						this.settleInput(
							msg.inputSequence,
							new DaemonInputError({
								message: `input ${msg.id} sequence ${msg.inputSequence}${code}: ${msg.message}; daemon did not prove the payload was not enqueued`,
								outcome: "outcome-unknown",
								inputId: pending.id,
								sequence: msg.inputSequence,
								code: msg.code,
							}),
						);
					}
				}
				// A late correlated error must never settle a concurrent open/close on
				// the same session id after the input waiter timed out.
				continue;
			}
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
		this.rejectPendingInputsUnknown(err?.message ?? "daemon disconnected");
		for (const cb of this.disconnectCbs) cb(err);
	}
}

function validateSessionList(value: unknown): SessionInfo[] {
	if (!Array.isArray(value)) {
		throw new Error("list: daemon returned a malformed session list");
	}
	for (const session of value) {
		if (
			typeof session !== "object" ||
			session === null ||
			typeof (session as Partial<SessionInfo>).id !== "string" ||
			!Number.isInteger((session as Partial<SessionInfo>).pid) ||
			!Number.isInteger((session as Partial<SessionInfo>).cols) ||
			!Number.isInteger((session as Partial<SessionInfo>).rows) ||
			typeof (session as Partial<SessionInfo>).alive !== "boolean"
		) {
			throw new Error("list: daemon returned a malformed session entry");
		}
	}
	return value as SessionInfo[];
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

function daemonSupportsSubscribedAck(version: string): boolean {
	return semver.satisfies(version, `>=${SUBSCRIBED_ACK_MIN_DAEMON_VERSION}`);
}
