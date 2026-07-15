import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as tty from "node:tty";
import * as nodePty from "node-pty";
import {
	type ProcessSignalError,
	type ProcessSignalTarget,
	signalProcessTargets,
	signalProcessTreeAndGroups,
} from "../process-tree.ts";
import type { SessionMeta } from "../protocol/index.ts";
import { AsyncFdWriteQueue } from "./AsyncFdWriteQueue.ts";

const KILL_ESCALATION_TIMEOUT_MS = 1000;
const HANDOFF_WRITE_DRAIN_TIMEOUT_MS = 2000;

export type PtyOnData = (data: Buffer) => void;
export type PtyOnExit = (info: {
	code: number | null;
	signal: number | null;
}) => void;

export interface Pty {
	readonly pid: number;
	readonly meta: SessionMeta;
	write(data: Buffer): void;
	resize(cols: number, rows: number): void;
	kill(signal?: NodeJS.Signals): void;
	onData(cb: PtyOnData): void;
	onExit(cb: PtyOnExit): void;
	/** Stop new input synchronously and drain all previously accepted writes. */
	prepareForHandoff(): Promise<void>;
	/**
	 * Stop consuming PTY output before the handoff snapshot is captured. Bytes
	 * produced afterwards stay in the kernel buffer for whichever daemon commits.
	 */
	pauseOutputForHandoff(): void;
	/** Drain bytes already read by Node before pause() reached libuv. */
	drainOutputForHandoff(): Promise<Buffer[]>;
	/** Permanently detach this predecessor's reader after COMMIT becomes irreversible. */
	sealOutputForHandoff(): Promise<Buffer[]>;
	/**
	 * child_process stdio setup can clear O_NONBLOCK on the shared open-file
	 * description before the successor adopts it. An aborted handoff must restore
	 * the predecessor's fd before input is accepted again.
	 */
	restoreAfterFailedHandoff(): void;
	/** Resume input if a handoff attempt aborts before ownership transfers. */
	cancelHandoff(): void;
	/**
	 * The kernel master fd backing this PTY. Required for daemon-upgrade
	 * fd-handoff (Phase 2): the successor daemon process inherits this fd
	 * via stdio so the slave-side shell stays alive across the binary swap.
	 *
	 * Reaches into node-pty's private `_fd` property — see the version pin
	 * in package.json and the spawn-time assert below.
	 */
	getMasterFd(): number;
}

export interface SpawnOptions {
	meta: SessionMeta;
}

class NodePtyAdapter implements Pty {
	readonly pid: number;
	meta: SessionMeta;
	private term: nodePty.IPty;
	private exited = false;
	private killEscalationTimer: NodeJS.Timeout | null = null;
	private exitInfo: { code: number | null; signal: number | null } | null =
		null;
	private exitCallbacks: PtyOnExit[] = [];
	private readonly handoffWriteStream: NodePtyCustomWriteStream;
	private handoffFrozen = false;
	private outputPausedForHandoff = false;
	private readonly dataCallbacks: PtyOnData[] = [];
	private readonly pausedOutput: Buffer[] = [];

	constructor(term: nodePty.IPty, meta: SessionMeta) {
		this.term = term;
		this.pid = term.pid;
		this.meta = meta;
		// node-pty is pinned to 1.1.0. Validate every private field needed by
		// handoff at spawn time, while a broken dependency contract is still
		// attributable to this session instead of surfacing during an upgrade.
		this.handoffWriteStream = requireNodePtyWriteStream(term);
		this.term.onData((data) => {
			const chunk =
				typeof data === "string"
					? Buffer.from(data, "utf8")
					: Buffer.from(data);
			if (this.outputPausedForHandoff) {
				this.pausedOutput.push(chunk);
				return;
			}
			for (const callback of this.dataCallbacks) callback(chunk);
		});
		this.term.onExit(({ exitCode, signal }) => {
			if (this.exited) return;
			this.exited = true;
			this.exitInfo = { code: exitCode ?? null, signal: signal ?? null };
			for (const cb of this.exitCallbacks) cb(this.exitInfo);
		});
	}

	getMasterFd(): number {
		// node-pty 1.1.x exposes the master fd as the private property `_fd`.
		// Pinned to "1.1.0" in package.json so a future bump can't break this
		// silently — assert here so a missing/changed field surfaces at the
		// first spawn, not when the user clicks "Update" months later.
		const fd = (this.term as unknown as { _fd?: unknown })._fd;
		if (typeof fd !== "number" || !Number.isInteger(fd) || fd < 0) {
			throw new Error(
				`node-pty master fd unavailable (got ${typeof fd}: ${fd}). ` +
					`Phase 2 fd-handoff depends on node-pty's private _fd property — ` +
					`pin node-pty to 1.1.x or update Pty.ts to match the new shape.`,
			);
		}
		return fd;
	}

	write(data: Buffer): void {
		if (this.handoffFrozen) {
			throw new Error("pty input is frozen for daemon handoff");
		}
		// node-pty's write accepts strings or buffers; pass buffer to keep bytes intact.
		this.term.write(data as unknown as string);
	}

	resize(cols: number, rows: number): void {
		validateDims(cols, rows);
		this.term.resize(cols, rows);
		this.meta = { ...this.meta, cols, rows };
	}

	kill(signal?: NodeJS.Signals): void {
		const killSignal = signal ?? "SIGHUP";
		const escalationTargets = signalProcessTreeAndGroups(this.pid, killSignal, {
			includeRoot: false,
			onSignalError: logProcessSignalError,
		});
		this.term.kill(killSignal);
		this.scheduleKillEscalation(killSignal, escalationTargets);
	}

	onData(cb: PtyOnData): void {
		this.dataCallbacks.push(cb);
	}

	onExit(cb: PtyOnExit): void {
		if (this.exitInfo) {
			cb(this.exitInfo);
			return;
		}
		this.exitCallbacks.push(cb);
	}

	async prepareForHandoff(): Promise<void> {
		// This assignment deliberately happens before the first await. A write
		// arriving in the same turn after prepareUpgrade() starts is rejected.
		this.handoffFrozen = true;
		await drainNodePtyWriteStream(
			this.handoffWriteStream,
			HANDOFF_WRITE_DRAIN_TIMEOUT_MS,
		);
	}

	pauseOutputForHandoff(): void {
		if (this.outputPausedForHandoff) return;
		const terminal = this.term as unknown as { pause?: () => unknown };
		if (typeof terminal.pause !== "function") {
			throw new Error(
				"daemon handoff requires node-pty pause() output control",
			);
		}
		terminal.pause();
		this.outputPausedForHandoff = true;
	}

	async drainOutputForHandoff(): Promise<Buffer[]> {
		if (!this.outputPausedForHandoff) {
			throw new Error("PTY output must be paused before handoff drain");
		}
		const terminal = this.term as unknown as {
			pause?: () => unknown;
			resume?: () => unknown;
		};
		if (
			typeof terminal.pause !== "function" ||
			typeof terminal.resume !== "function"
		) {
			throw new Error("daemon handoff requires node-pty output flow control");
		}
		// Flow the already-buffered Readable data through our interception hook,
		// then stop libuv again. Two turns cover resume scheduling plus a read that
		// was already armed when pause() ran; every delivered byte is queued above.
		terminal.resume();
		await new Promise((resolve) => setImmediate(resolve));
		terminal.pause();
		await new Promise((resolve) => setImmediate(resolve));
		return this.pausedOutput.splice(0);
	}

	async sealOutputForHandoff(): Promise<Buffer[]> {
		const chunks = await this.drainOutputForHandoff();
		const socket = (this.term as unknown as { _socket?: unknown })._socket as
			| { destroy?: () => unknown }
			| undefined;
		if (!socket || typeof socket.destroy !== "function") {
			throw new Error("daemon handoff requires detachable node-pty reader");
		}
		socket.destroy();
		await new Promise((resolve) => setImmediate(resolve));
		chunks.push(...this.pausedOutput.splice(0));
		return chunks;
	}

	cancelHandoff(): void {
		if (this.outputPausedForHandoff) {
			const terminal = this.term as unknown as { resume?: () => unknown };
			if (typeof terminal.resume !== "function") {
				throw new Error(
					"daemon handoff requires node-pty resume() output control",
				);
			}
			this.outputPausedForHandoff = false;
			for (const chunk of this.pausedOutput.splice(0)) {
				for (const callback of this.dataCallbacks) callback(chunk);
			}
			terminal.resume();
		}
		this.handoffFrozen = false;
	}

	restoreAfterFailedHandoff(): void {
		const readStream = (this.term as unknown as { _socket?: unknown })._socket;
		try {
			setAdoptedPtyNonBlocking(readStream);
		} catch (error) {
			// A blocking master can pin a global libuv worker forever. If the
			// runtime contract disappeared, fail this PTY closed instead of
			// returning it to service in a daemon-wide hazardous state.
			try {
				this.term.kill("SIGKILL");
			} catch {
				// Preserve the nonblocking restoration error below.
			}
			throw error;
		}
	}

	private scheduleKillEscalation(
		signal: NodeJS.Signals,
		targets: ProcessSignalTarget[],
	): void {
		if (signal === "SIGKILL" || this.exited || this.killEscalationTimer) return;

		this.killEscalationTimer = setTimeout(() => {
			this.killEscalationTimer = null;
			signalProcessTargets(targets, "SIGKILL", logProcessSignalError);
			try {
				this.term.kill("SIGKILL");
			} catch {
				// PTY root may have already exited; detached targets still matter.
			}
		}, KILL_ESCALATION_TIMEOUT_MS);
		this.killEscalationTimer.unref();
	}
}

interface NodePtyWriteTask {
	buffer: Buffer;
	offset: number;
}

interface NodePtyCustomWriteStream {
	_fd: number;
	_writeQueue: NodePtyWriteTask[];
	_writeImmediate?: NodeJS.Immediate;
	write(data: string | Buffer): void;
}

/** @internal Exported so the pinned node-pty private contract is testable. */
export function requireNodePtyWriteStream(
	term: unknown,
): NodePtyCustomWriteStream {
	const candidate = (
		term as {
			_fd?: unknown;
			_writeStream?: unknown;
		}
	)._writeStream as Partial<NodePtyCustomWriteStream> | undefined;
	const masterFd = (term as { _fd?: unknown })._fd;
	if (
		typeof masterFd !== "number" ||
		!Number.isInteger(masterFd) ||
		masterFd < 0 ||
		!candidate ||
		candidate._fd !== masterFd ||
		!Array.isArray(candidate._writeQueue) ||
		(candidate._writeImmediate !== undefined &&
			typeof candidate._writeImmediate !== "object") ||
		typeof candidate.write !== "function"
	) {
		throw new Error(
			"node-pty 1.1.0 private CustomWriteStream contract unavailable; " +
				"daemon handoff requires matching _fd, _writeStream._fd, _writeQueue, _writeImmediate, and write()",
		);
	}
	assertNodePtyWriteTasks(candidate._writeQueue);
	return candidate as NodePtyCustomWriteStream;
}

async function drainNodePtyWriteStream(
	stream: NodePtyCustomWriteStream,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		assertNodePtyWriteTasks(stream._writeQueue);
		if (
			stream._writeQueue.length === 0 &&
			stream._writeImmediate === undefined
		) {
			return;
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`node-pty input queue did not drain within ${timeoutMs}ms (${nodePtyPendingBytes(stream._writeQueue)} bytes pending)`,
			);
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 2));
	}
}

function assertNodePtyWriteTasks(
	tasks: unknown[],
): asserts tasks is NodePtyWriteTask[] {
	for (const task of tasks) {
		const candidate = task as Partial<NodePtyWriteTask> | null;
		if (
			!candidate ||
			!Buffer.isBuffer(candidate.buffer) ||
			!Number.isInteger(candidate.offset) ||
			(candidate.offset as number) < 0 ||
			(candidate.offset as number) > candidate.buffer.byteLength
		) {
			throw new Error(
				"node-pty 1.1.0 private CustomWriteStream queue task contract changed",
			);
		}
	}
}

function nodePtyPendingBytes(tasks: NodePtyWriteTask[]): number {
	return tasks.reduce(
		(total, task) => total + task.buffer.byteLength - task.offset,
		0,
	);
}

function validateDims(cols: number, rows: number): void {
	if (!Number.isInteger(cols) || cols <= 0) {
		throw new Error(`invalid cols: ${cols}`);
	}
	if (!Number.isInteger(rows) || rows <= 0) {
		throw new Error(`invalid rows: ${rows}`);
	}
}

function reprobeErrno(meta: SessionMeta): string {
	try {
		const probe = childProcess.spawnSync(meta.shell, ["-c", ":"], {
			cwd: meta.cwd,
			timeout: 1000,
			stdio: "ignore",
		});
		if (!probe.error) return "ok";
		const e = probe.error as NodeJS.ErrnoException;
		return e.code ?? e.message;
	} catch (e) {
		return `reprobe-failed:${(e as Error).message}`;
	}
}

export function spawn({ meta }: SpawnOptions): Pty {
	validateDims(meta.cols, meta.rows);
	// Pre-flight: node-pty's "posix_spawnp failed" message swallows errno
	// and leaves no clue what went wrong. Surface the most common cause
	// ahead of the native call so the caller (and the user) can see it.
	if (meta.cwd !== undefined) {
		let stat: fs.Stats;
		try {
			stat = fs.statSync(meta.cwd);
		} catch (err) {
			const e = err as NodeJS.ErrnoException;
			if (e.code === "ENOENT") {
				throw new Error(
					`spawn: cwd does not exist: ${meta.cwd} (workspace may have been deleted or moved)`,
				);
			}
			throw new Error(
				`spawn: cwd not accessible: ${meta.cwd} (${e.code ?? e.message})`,
			);
		}
		if (!stat.isDirectory()) {
			throw new Error(`spawn: cwd is not a directory: ${meta.cwd}`);
		}
	}
	let term: nodePty.IPty;
	try {
		term = nodePty.spawn(meta.shell, meta.argv, {
			name: "xterm-256color",
			cols: meta.cols,
			rows: meta.rows,
			cwd: meta.cwd,
			env: meta.env,
			// node-pty's encoding defaults to utf8; we want raw bytes for fidelity.
			encoding: null,
		});
	} catch (err) {
		// node-pty's native "posix_spawnp failed." drops the errno, so re-probe
		// the same shell+cwd with spawnSync to surface the real code (e.g.
		// EMFILE/EAGAIN/ENOENT).
		throw new Error(
			`spawn failed (shell=${meta.shell} cwd=${meta.cwd ?? "(none)"} errno=${reprobeErrno(meta)}): ${(err as Error).message}`,
		);
	}
	try {
		const adapter = new NodePtyAdapter(term, meta);
		// Validate the private-fd dependency at spawn time, not handoff time.
		adapter.getMasterFd();
		return adapter;
	} catch (error) {
		// A private-contract mismatch happens after forkpty succeeded. Reap that
		// newly-created shell before surfacing the incompatibility.
		try {
			term.kill("SIGKILL");
		} catch {
			// Preserve the construction error.
		}
		throw error;
	}
}

/**
 * AdoptedPty — wraps a PTY master fd inherited from a predecessor daemon.
 *
 * The successor doesn't have a node-pty IPty for these sessions (no
 * `forkpty` was run; the fd already existed). We build a thin adapter
 * directly on the fd:
 *
 * - read via tty.ReadStream
 * - write via an async, memory-bounded per-session fd queue
 * - kill via process.kill(pid)
 * - onExit: read-stream 'end'/'error' OR PID-liveness poll (whichever first)
 *
 * Resize on adopted sessions is a known gap — TIOCSWINSZ requires either
 * a native ioctl helper (koffi) or a dedicated tiny addon. Until then,
 * resize() updates `meta.cols/rows` but leaves the kernel-side window
 * size untouched. Accept the limitation; ship Phase 2; address resize
 * follow-up.
 */
interface DeferredDestroy {
	error: Error | null;
	callback: (error?: Error | null) => void;
}

/** @internal Exported only so the runtime contract can be tested without a PTY. */
export function setAdoptedPtyNonBlocking(stream: unknown): void {
	const handle = (
		stream as {
			_handle?: { setBlocking?: (blocking: boolean) => number };
		}
	)?._handle;
	if (!handle || typeof handle.setBlocking !== "function") {
		throw new Error("adopted PTY TTY handle cannot set nonblocking mode");
	}
	const result = handle.setBlocking(false);
	if (result !== 0) {
		throw new Error(
			`adopted PTY failed to enter nonblocking mode (uv error ${result})`,
		);
	}
}

/**
 * tty.ReadStream normally closes its fd as soon as destroy starts. That is not
 * safe while libuv still has an fs.write for the same numeric fd: the OS can
 * reuse the number before the worker executes it. Defer only the underlying
 * handle close; stream teardown and the owning session remain non-blocking.
 */
class AdoptedPtyReadStream extends tty.ReadStream {
	private fdCloseAllowed = false;
	private deferredDestroy: DeferredDestroy | null = null;
	private onDestroyRequested: (() => void) | null = null;

	setDestroyRequestedCallback(callback: () => void): void {
		this.onDestroyRequested = callback;
	}

	override _destroy(
		error: Error | null,
		callback: (error?: Error | null) => void,
	): void {
		if (this.fdCloseAllowed) {
			super._destroy(error, callback);
			return;
		}

		this.deferredDestroy = { error, callback };
		this.onDestroyRequested?.();
	}

	closeFdWhenWritesComplete(): void {
		if (this.fdCloseAllowed) return;
		this.fdCloseAllowed = true;
		const deferred = this.deferredDestroy;
		this.deferredDestroy = null;
		if (deferred) {
			super._destroy(deferred.error, deferred.callback);
			return;
		}
		this.destroy();
	}

	detachForHandoff(): void {
		this.onDestroyRequested = null;
		this.fdCloseAllowed = true;
		this.removeAllListeners("data");
		this.removeAllListeners("end");
		this.removeAllListeners("error");
		this.destroy();
	}
}

class AdoptedPty implements Pty {
	readonly pid: number;
	meta: SessionMeta;
	private readonly fd: number;
	private readonly reader: AdoptedPtyReadStream;
	private readonly writeQueue: AsyncFdWriteQueue;
	private exitFired = false;
	private exitInfo: { code: number | null; signal: number | null } | null =
		null;
	private livenessTimer: NodeJS.Timeout | null = null;
	private killEscalationTimer: NodeJS.Timeout | null = null;
	private exitCallbacks: PtyOnExit[] = [];
	private outputPausedForHandoff = false;
	private readonly dataCallbacks: PtyOnData[] = [];
	private readonly pausedOutput: Buffer[] = [];
	private dataListenerAttached = false;

	constructor(fd: number, pid: number, meta: SessionMeta) {
		this.fd = fd;
		this.pid = pid;
		this.meta = meta;
		this.reader = new AdoptedPtyReadStream(fd);
		try {
			// fd handoff through child_process stdio restores blocking mode on the
			// inherited PTY master. A blocking fs.write can pin one libuv worker
			// forever; four such sessions exhaust Node's default global worker pool.
			setAdoptedPtyNonBlocking(this.reader);
		} catch (error) {
			// Fail closed: without nonblocking semantics the async queue cannot make
			// the daemon-wide isolation guarantee. No writes have been submitted yet,
			// so the fd can be closed immediately.
			this.reader.closeFdWhenWritesComplete();
			throw error;
		}
		this.writeQueue = new AsyncFdWriteQueue({
			fd,
			closeFd: () => this.reader.closeFdWhenWritesComplete(),
			onFatalError: (error) => this.handleFatalWrite(error),
		});
		this.reader.setDestroyRequestedCallback(() =>
			this.finishExit({ code: null, signal: null }),
		);

		// onExit signal sources:
		//   1. read stream 'end' or 'error' — the slave-side close drives EOF
		//      / EIO on the master fd, which Node's stream surfaces as 'end'
		//      (EOF) or 'error' (EIO).
		//   2. PID-liveness poll — defense in depth for cases where the read
		//      stream lingers without firing 'end' promptly.
		this.reader.on("end", () => this.finishExit({ code: null, signal: null }));
		this.reader.on("error", () =>
			this.finishExit({ code: null, signal: null }),
		);
		this.livenessTimer = setInterval(() => {
			if (!isPidAlive(this.pid)) {
				this.finishExit({ code: null, signal: null });
			}
		}, 1000);
		this.livenessTimer.unref();
	}

	getMasterFd(): number {
		return this.fd;
	}

	write(data: Buffer): void {
		if (this.exitFired) {
			throw new Error(`session exited: ${this.pid}`);
		}
		this.writeQueue.enqueue(data);
	}

	async prepareForHandoff(): Promise<void> {
		await this.writeQueue.freezeAndDrain(HANDOFF_WRITE_DRAIN_TIMEOUT_MS);
	}

	pauseOutputForHandoff(): void {
		if (this.outputPausedForHandoff) return;
		this.reader.pause();
		this.outputPausedForHandoff = true;
	}

	async drainOutputForHandoff(): Promise<Buffer[]> {
		if (!this.outputPausedForHandoff) {
			throw new Error("adopted PTY output must be paused before handoff drain");
		}
		this.reader.resume();
		await new Promise((resolve) => setImmediate(resolve));
		this.reader.pause();
		await new Promise((resolve) => setImmediate(resolve));
		return this.pausedOutput.splice(0);
	}

	async sealOutputForHandoff(): Promise<Buffer[]> {
		const chunks = await this.drainOutputForHandoff();
		if (this.livenessTimer) clearInterval(this.livenessTimer);
		this.livenessTimer = null;
		this.reader.detachForHandoff();
		await new Promise((resolve) => setImmediate(resolve));
		chunks.push(...this.pausedOutput.splice(0));
		return chunks;
	}

	cancelHandoff(): void {
		if (this.outputPausedForHandoff) {
			this.outputPausedForHandoff = false;
			for (const chunk of this.pausedOutput.splice(0)) {
				for (const callback of this.dataCallbacks) callback(chunk);
			}
			this.reader.resume();
		}
		this.writeQueue.unfreeze();
	}

	restoreAfterFailedHandoff(): void {
		try {
			setAdoptedPtyNonBlocking(this.reader);
		} catch (error) {
			const fatal = asError(error);
			this.handleFatalWrite(fatal);
			throw fatal;
		}
	}

	resize(cols: number, rows: number): void {
		validateDims(cols, rows);
		this.meta = { ...this.meta, cols, rows };
		// TIOCSWINSZ on the master fd is what node-pty does internally
		// for non-adopted sessions; we don't have that native binding
		// here. Workaround: spawn `stty` with the master fd as its
		// stdin. stty(1) issues TIOCSWINSZ on its own stdin by default.
		// One process spawn per resize — resize is rare (window-drag
		// throttled by xterm.js), so this is fine.
		try {
			childProcess.spawnSync(
				"stty",
				["cols", String(cols), "rows", String(rows)],
				{
					stdio: [this.fd, "ignore", "ignore"],
					timeout: 1000,
				},
			);
		} catch {
			// Best-effort. If stty isn't available, the meta still
			// reflects the requested dims; the kernel side stays stale.
		}

		// child_process duplicates the fd into the child's stdio and, while
		// doing so, clears O_NONBLOCK on the shared open-file description.
		// Always restore it, even when stty failed or timed out.
		try {
			setAdoptedPtyNonBlocking(this.reader);
		} catch (error) {
			const fatal = asError(error);
			this.handleFatalWrite(fatal);
			throw fatal;
		}
	}

	kill(signal?: NodeJS.Signals): void {
		const killSignal = signal ?? "SIGHUP";
		const escalationTargets = signalProcessTreeAndGroups(this.pid, killSignal, {
			onSignalError: logProcessSignalError,
		});
		this.scheduleKillEscalation(killSignal, escalationTargets);
	}

	onData(cb: PtyOnData): void {
		this.dataCallbacks.push(cb);
		if (this.dataListenerAttached) return;
		this.dataListenerAttached = true;
		this.reader.on("data", (data) => {
			const chunk =
				typeof data === "string"
					? Buffer.from(data, "utf8")
					: Buffer.from(data);
			if (this.outputPausedForHandoff) {
				this.pausedOutput.push(chunk);
				return;
			}
			for (const callback of this.dataCallbacks) callback(chunk);
		});
	}

	onExit(cb: PtyOnExit): void {
		if (this.exitInfo) {
			cb(this.exitInfo);
			return;
		}
		this.exitCallbacks.push(cb);
	}

	private scheduleKillEscalation(
		signal: NodeJS.Signals,
		targets: ProcessSignalTarget[],
	): void {
		if (signal === "SIGKILL" || this.exitFired || this.killEscalationTimer)
			return;

		this.killEscalationTimer = setTimeout(() => {
			this.killEscalationTimer = null;
			signalProcessTargets(targets, "SIGKILL", logProcessSignalError);
		}, KILL_ESCALATION_TIMEOUT_MS);
		this.killEscalationTimer.unref();
	}

	private handleFatalWrite(error: Error): void {
		process.stderr.write(
			`[pty-daemon] adopted PTY ${this.pid} write failed: ${error.message}\n`,
		);
		this.finishExit({ code: null, signal: null });
	}

	private finishExit(info: {
		code: number | null;
		signal: number | null;
	}): void {
		if (this.exitFired) return;
		this.exitFired = true;
		this.exitInfo = info;
		if (this.livenessTimer) clearInterval(this.livenessTimer);
		this.livenessTimer = null;
		// fs.write cannot be cancelled. Stop and unref reads immediately, but keep
		// the shared descriptor alive until every submitted write callback returns.
		// Closing it earlier lets the OS reuse the fd number for an unrelated file
		// before a queued libuv worker executes the write.
		this.reader.pause();
		this.reader.removeAllListeners("data");
		this.reader.unref();
		this.writeQueue.dispose(new Error(`session exited: ${this.pid}`));
		for (const cb of this.exitCallbacks) cb(info);
	}
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// EPERM means the pid exists but isn't ours — count as alive.
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

function logProcessSignalError(event: ProcessSignalError): void {
	if ((event.error as NodeJS.ErrnoException).code === "ESRCH") return;

	const label = event.target === "pgid" ? "process group" : "pid";
	process.stderr.write(
		`[pty-daemon] failed to ${event.signal} ${label} ${event.id}: ${(event.error as Error).message}\n`,
	);
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export interface AdoptOptions {
	fd: number;
	pid: number;
	meta: SessionMeta;
}

export function adoptFromFd({ fd, pid, meta }: AdoptOptions): Pty {
	if (!Number.isInteger(fd) || fd < 0) {
		throw new Error(`invalid fd: ${fd}`);
	}
	if (!Number.isInteger(pid) || pid <= 0) {
		throw new Error(`invalid pid: ${pid}`);
	}
	validateDims(meta.cols, meta.rows);
	return new AdoptedPty(fd, pid, meta);
}
