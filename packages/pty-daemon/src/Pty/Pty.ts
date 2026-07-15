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
	/**
	 * Optional hook for adapters that own a user-space input queue. Stops new
	 * input and drains that queue before fd handoff. NodePtyAdapter intentionally
	 * retains node-pty's existing best-effort handoff semantics because its
	 * private write-stream queue has no stable drain API.
	 */
	prepareForHandoff?(): Promise<void>;
	/** Resume input if a handoff attempt aborts before ownership transfers. */
	cancelHandoff?(): void;
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

	constructor(term: nodePty.IPty, meta: SessionMeta) {
		this.term = term;
		this.pid = term.pid;
		this.meta = meta;
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
		this.term.onData((d) => {
			cb(typeof d === "string" ? Buffer.from(d, "utf8") : d);
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
	const adapter = new NodePtyAdapter(term, meta);
	// Validate the private-fd dependency at spawn time, not handoff time.
	adapter.getMasterFd();
	return adapter;
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

	cancelHandoff(): void {
		this.writeQueue.unfreeze();
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
	}

	kill(signal?: NodeJS.Signals): void {
		const killSignal = signal ?? "SIGHUP";
		const escalationTargets = signalProcessTreeAndGroups(this.pid, killSignal, {
			onSignalError: logProcessSignalError,
		});
		this.scheduleKillEscalation(killSignal, escalationTargets);
	}

	onData(cb: PtyOnData): void {
		this.reader.on("data", (chunk) => {
			cb(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
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
