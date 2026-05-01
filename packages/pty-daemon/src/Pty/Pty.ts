import * as fs from "node:fs";
import * as nodePty from "node-pty";
import type { SessionMeta } from "../protocol/index.ts";

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

	constructor(term: nodePty.IPty, meta: SessionMeta) {
		this.term = term;
		this.pid = term.pid;
		this.meta = meta;
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
		this.term.kill(signal);
	}

	onData(cb: PtyOnData): void {
		this.term.onData((d) => {
			cb(typeof d === "string" ? Buffer.from(d, "utf8") : d);
		});
	}

	onExit(cb: PtyOnExit): void {
		this.term.onExit(({ exitCode, signal }) => {
			cb({ code: exitCode ?? null, signal: signal ?? null });
		});
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
	const term = nodePty.spawn(meta.shell, meta.argv, {
		name: "xterm-256color",
		cols: meta.cols,
		rows: meta.rows,
		cwd: meta.cwd,
		env: meta.env,
		// node-pty's encoding defaults to utf8; we want raw bytes for fidelity.
		encoding: null,
	});
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
			for (const cb of this.exitCallbacks) cb(info);
		};
		this.reader.on("end", () => onExit({ code: null, signal: null }));
		this.reader.on("error", () => onExit({ code: null, signal: null }));
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
		// TODO(phase2-followup): wire TIOCSWINSZ via koffi or native helper.
		// Today: track meta only — kernel-side window size is whatever it
		// was at adoption time. Acceptable temporarily; visible to users
		// only if they resize a session that was carried across an upgrade.
		this.meta = { ...this.meta, cols, rows };
	}

	kill(signal?: NodeJS.Signals): void {
		try {
			process.kill(this.pid, signal ?? "SIGHUP");
		} catch {
			// Already dead; idempotent kill.
		}
	}

	onData(cb: PtyOnData): void {
		this.reader.on("data", (chunk) => {
			cb(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
		});
	}

	onExit(cb: PtyOnExit): void {
		this.exitCallbacks.push(cb);
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
