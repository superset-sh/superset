import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as nodePty from "node-pty";
import {
	type ProcessSignalError,
	type ProcessSignalTarget,
	signalProcessTargets,
	signalProcessTreeAndGroups,
} from "../process-tree.ts";
import type { SessionMeta } from "../protocol/index.ts";

const KILL_ESCALATION_TIMEOUT_MS = 1000;

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
		// Annotate with shell + cwd so the wire-error reply is actionable.
		throw new Error(
			`spawn failed (shell=${meta.shell} cwd=${meta.cwd ?? "(none)"}): ${(err as Error).message}`,
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
 * - read via fs.createReadStream
 * - write via fs.createWriteStream
 * - kill via process.kill(pid)
 * - onExit: read-stream 'end'/'error' OR PID-liveness poll (whichever first)
 *
 * Resize on adopted sessions is a known gap — TIOCSWINSZ requires either
 * a native ioctl helper (koffi) or a dedicated tiny addon. Until then,
 * resize() updates `meta.cols/rows` but leaves the kernel-side window
 * size untouched. Accept the limitation; ship Phase 2; address resize
 * follow-up.
 */
class AdoptedPty implements Pty {
	readonly pid: number;
	meta: SessionMeta;
	private readonly fd: number;
	private readonly reader: fs.ReadStream;
	private readonly writer: fs.WriteStream;
	private exitFired = false;
	private livenessTimer: NodeJS.Timeout | null = null;
	private killEscalationTimer: NodeJS.Timeout | null = null;
	private exitCallbacks: PtyOnExit[] = [];

	constructor(fd: number, pid: number, meta: SessionMeta) {
		this.fd = fd;
		this.pid = pid;
		this.meta = meta;
		this.reader = fs.createReadStream("", { fd, autoClose: false });
		this.writer = fs.createWriteStream("", { fd, autoClose: false });

		// onExit signal sources:
		//   1. read stream 'end' or 'error' — the slave-side close drives EOF
		//      / EIO on the master fd, which Node's stream surfaces as 'end'
		//      (EOF) or 'error' (EIO).
		//   2. PID-liveness poll — defense in depth for cases where the read
		//      stream lingers without firing 'end' promptly.
		const onExit = (info: { code: number | null; signal: number | null }) => {
			if (this.exitFired) return;
			this.exitFired = true;
			if (this.livenessTimer) clearInterval(this.livenessTimer);
			// Close the read/write streams so the inherited fd doesn't keep
			// the event loop alive after the shell exits. We use
			// `autoClose: false` (so handoff-time refcounting works), which
			// means we have to drive the close ourselves.
			try {
				this.reader.destroy();
			} catch {
				// already closed
			}
			try {
				this.writer.destroy();
			} catch {
				// already closed
			}
			try {
				fs.closeSync(this.fd);
			} catch {
				// already closed
			}
			for (const cb of this.exitCallbacks) cb(info);
		};
		this.reader.on("end", () => onExit({ code: null, signal: null }));
		this.reader.on("error", () => onExit({ code: null, signal: null }));
		// Without this listener, a write that races a slave-side close
		// emits 'error' with no handler and crashes the daemon.
		this.writer.on("error", () => onExit({ code: null, signal: null }));
		this.livenessTimer = setInterval(() => {
			if (!isPidAlive(this.pid)) onExit({ code: null, signal: null });
		}, 1000);
		this.livenessTimer.unref();
	}

	getMasterFd(): number {
		return this.fd;
	}

	write(data: Buffer): void {
		this.writer.write(data);
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
