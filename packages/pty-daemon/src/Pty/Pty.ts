import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as tty from "node:tty";
import * as nodePty from "node-pty";
import {
	collectProcessSignalTargets,
	getProcessGroupAndTty,
	type ProcessInfo,
	type ProcessSignalError,
	readProcessTable,
	readProcessTableAsync,
	signalProcessTargets,
} from "../process-tree.ts";
import type { SessionMeta } from "../protocol/index.ts";

const KILL_ESCALATION_TIMEOUT_MS = 1000;
/**
 * Verify-round backoff after the SIGKILL escalation. The long tail exists
 * for loaded machines: a SIGHUP-trapping shell that only gets scheduled
 * seconds after the volley can still fork (agent MCP spawn bursts) — a
 * short fixed window would hand those forks eternal life. Rounds stop
 * early the moment nothing is left, so a clean kill never pays the tail.
 */
const KILL_VERIFY_DELAYS_MS = [300, 700, 1500, 2500];

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Kill chains still running (SIGKILL escalation + verify rounds). The daemon
 * exits via explicit process.exit(), which would silently drop a chain mid
 * kill — shutdown awaits this first so a requested close always finishes.
 */
const pendingKills = new Set<Promise<void>>();

/** Returns a never-rejecting wrapper so callers can chain without leaks. */
function registerPendingKill(chain: Promise<void>): Promise<void> {
	const tracked = chain.catch((err) => {
		process.stderr.write(
			`[pty-daemon] kill escalation crashed: ${(err as Error)?.stack ?? err}\n`,
		);
	});
	pendingKills.add(tracked);
	void tracked.then(() => pendingKills.delete(tracked));
	return tracked;
}

export async function drainPendingKills(timeoutMs: number): Promise<void> {
	if (pendingKills.size === 0) return;
	let timer: NodeJS.Timeout | undefined;
	await Promise.race([
		Promise.allSettled([...pendingKills]),
		new Promise<void>((r) => {
			timer = setTimeout(r, timeoutMs);
		}),
	]);
	clearTimeout(timer);
}

/**
 * Kill orchestration shared by both adapters, which differ only in how they
 * signal the root and how they know it's dead.
 *
 * Owns the session root's durable coordinates — controlling tty plus every
 * process group ever observed (a ppid walk can't rediscover either once the
 * intermediate parents die) — and the SIGKILL escalation chain: each round
 * takes a fresh process-table snapshot, because the initial volley's target
 * list goes stale the moment a descendant forks. Timers stay ref'd on
 * purpose: a naturally-exiting daemon must not drop a half-finished kill.
 */
class TreeKiller {
	private ttyName: string | null = null;
	private readonly knownPgids = new Set<number>();
	private killChain: Promise<void> | null = null;
	private readonly rootPid: number;
	private readonly isRootAlive: () => boolean;
	/** Best-effort signal to the root process itself; must not throw. */
	private readonly signalRoot: (signal: NodeJS.Signals) => void;

	// No parameter properties: the daemon runs under node's strip-only TS
	// mode, which rejects them.
	constructor(
		rootPid: number,
		isRootAlive: () => boolean,
		signalRoot: (signal: NodeJS.Signals) => void,
	) {
		this.rootPid = rootPid;
		this.isRootAlive = isRootAlive;
		this.signalRoot = signalRoot;
	}

	/**
	 * Record the root's pgid + tty. Called at construction (if the shell exits
	 * before the first kill, nothing else can rediscover them) and refreshed
	 * by every volley from its own table. Async — session-open path.
	 */
	async captureIdentity(): Promise<void> {
		const { pgid, tty } = await getProcessGroupAndTty(this.rootPid);
		if (tty !== null) this.ttyName = tty;
		if (pgid !== null) this.knownPgids.add(pgid);
	}

	kill(signal: NodeJS.Signals): void {
		this.volley(signal);
		this.signalRoot(signal);
		if (signal === "SIGKILL" || this.killChain) return;
		const chain = registerPendingKill(this.runEscalation());
		this.killChain = chain;
		// Reset when done so a retried close can escalate again.
		void chain.then(() => {
			if (this.killChain === chain) this.killChain = null;
		});
	}

	/**
	 * One kill pass: collect the current tree + known-group members + same-tty
	 * stragglers, record the root's and any newly seen groups, signal all of
	 * it (root excluded — signalRoot handles that). Pass a pre-read `table`
	 * from async paths; the sync fallback (one ps, same cost as the
	 * pre-hardening kill) is for the synchronous kill() entrypoint.
	 */
	private volley(
		signal: NodeJS.Signals,
		table?: ProcessInfo[],
	): { survivors: boolean } {
		const psTable = table ?? readProcessTable();
		const rootRow = psTable.find((r) => r.pid === this.rootPid);
		if (rootRow) {
			if (rootRow.tty !== null) this.ttyName = rootRow.tty;
			this.knownPgids.add(rootRow.pgid);
		}
		const targets = collectProcessSignalTargets(this.rootPid, {
			includeRoot: false,
			// tty targeting only while the root is alive in this same snapshot:
			// the kernel recycles the pty slot the moment the master fd closes,
			// so after root death a tty match can only ever hit a NEW session
			// that inherited the slot (legit stragglers show "??" by then).
			ttyName: rootRow ? this.ttyName : null,
			knownPgids: this.knownPgids,
			table: psTable,
			onSignalError: logProcessSignalError,
		});
		for (const t of targets) {
			if (t.target === "pgid") this.knownPgids.add(t.id);
		}
		signalProcessTargets(targets, signal, logProcessSignalError);
		return { survivors: targets.some((t) => t.target === "pid") };
	}

	private async runEscalation(): Promise<void> {
		await delay(KILL_ESCALATION_TIMEOUT_MS);
		for (let round = 0; ; round++) {
			const table = await readProcessTableAsync();
			const rootAlive = this.isRootAlive();
			if (table !== null) {
				const { survivors } = this.volley("SIGKILL", table);
				if (!survivors && !rootAlive) return;
			}
			// A null table means ps failed — state unknown; keep the root kill
			// and burn a round rather than concluding the kill is complete.
			if (rootAlive) this.signalRoot("SIGKILL");
			const nextDelay = KILL_VERIFY_DELAYS_MS[round];
			if (nextDelay === undefined) break;
			await delay(nextDelay);
		}
		// Let the final volley's SIGKILLs land before declaring survivors.
		await delay(300);
		const finalTable = await readProcessTableAsync();
		if (finalTable === null) {
			process.stderr.write(
				`[pty-daemon] kill escalation for pid ${this.rootPid}: final ps failed, survivor state unknown\n`,
			);
			return;
		}
		const finalRootRow = finalTable.find((r) => r.pid === this.rootPid);
		const leftovers = collectProcessSignalTargets(this.rootPid, {
			includeRoot: false,
			ttyName: finalRootRow ? this.ttyName : null,
			knownPgids: this.knownPgids,
			table: finalTable,
		}).filter((t) => t.target === "pid");
		if (leftovers.length > 0 || this.isRootAlive()) {
			process.stderr.write(
				`[pty-daemon] kill escalation for pid ${this.rootPid} left survivors: ` +
					`root=${this.isRootAlive()} pids=[${leftovers.map((t) => t.id).join(",")}]\n`,
			);
		}
	}
}

export type PtyOnData = (data: Buffer) => void;
export type PtyOnExit = (info: {
	code: number | null;
	signal: number | null;
}) => void;

export interface DisposeOptions {
	/** Stop adopted-PTY exit polling when the caller has already untracked it. */
	keepExitPolling?: boolean;
}

export interface Pty {
	readonly pid: number;
	readonly meta: SessionMeta;
	write(data: Buffer): void;
	resize(cols: number, rows: number): void;
	kill(signal?: NodeJS.Signals): void;
	onData(cb: PtyOnData): void;
	onExit(cb: PtyOnExit): void;
	/**
	 * Flow control: stop reading from the PTY master. The kernel PTY buffer
	 * (~64KB) fills and the foreground process blocks on write, throttling
	 * itself — same mechanism as VS Code's ptyHost pause/resume.
	 */
	pause(): void;
	resume(): void;
	/**
	 * Release this process's ownership of the PTY master fd. Idempotent.
	 *
	 * Disposal is separate from TreeKiller: callers signal the process tree
	 * first, then release the descriptor. A successful daemon handoff is the
	 * exception — the predecessor must leave its adapter untouched because
	 * node-pty disposal also signals the shell after closing its stream.
	 */
	dispose(options?: DisposeOptions): void;
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
	private readonly killer: TreeKiller;
	private exitInfo: { code: number | null; signal: number | null } | null =
		null;
	private exitCallbacks: PtyOnExit[] = [];
	private disposed = false;

	constructor(term: nodePty.IPty, meta: SessionMeta) {
		this.term = term;
		this.pid = term.pid;
		this.meta = meta;
		this.killer = new TreeKiller(
			this.pid,
			() => !this.exited,
			(sig) => {
				try {
					this.term.kill(sig);
				} catch {
					// PTY root may have already exited; detached targets still matter.
				}
			},
		);
		// The immediate capture races the child's setsid/login_tty (it may
		// still show the daemon's own pgid — collect's current-pgid guard
		// covers that — and no tty), so re-capture once the child has
		// certainly run.
		void this.killer.captureIdentity();
		setTimeout(() => {
			if (!this.exited) void this.killer.captureIdentity();
		}, 100).unref();
		this.term.onExit(({ exitCode, signal }) => {
			if (this.exited) return;
			this.exited = true;
			this.exitInfo = { code: exitCode ?? null, signal: signal ?? null };
			this.dispose();
			for (const cb of this.exitCallbacks) cb(this.exitInfo);
		});
	}

	dispose(_options?: DisposeOptions): void {
		if (this.disposed) return;
		this.disposed = true;
		// Keep TreeKiller's escalation chain intact. A root shell can exit while
		// a detached descendant that ignored SIGHUP is still alive; the kill
		// chain's later snapshots are what find and reap those survivors.
		try {
			// UnixTerminal.destroy() closes the read socket/master fd and its
			// write stream. node-pty omits destroy() from IPty's public typings.
			(this.term as unknown as { destroy(): void }).destroy();
		} catch {
			// node-pty may already have torn the socket down on its exit path.
		}
	}

	getMasterFd(): number {
		// node-pty 1.2 beta exposes the master fd as the private property `_fd`.
		// Pinned exactly in package.json so a future bump can't break this
		// silently — assert here so a missing/changed field surfaces at the
		// first spawn, not when the user clicks "Update" months later.
		const fd = (this.term as unknown as { _fd?: unknown })._fd;
		if (typeof fd !== "number" || !Number.isInteger(fd) || fd < 0) {
			throw new Error(
				`node-pty master fd unavailable (got ${typeof fd}: ${fd}). ` +
					`Phase 2 fd-handoff depends on node-pty's private _fd property — ` +
					`keep node-pty pinned or update Pty.ts to match the new shape.`,
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
		this.killer.kill(signal ?? "SIGHUP");
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

	pause(): void {
		if (this.exited || this.disposed) return;
		this.term.pause();
	}

	resume(): void {
		if (this.exited || this.disposed) return;
		this.term.resume();
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
	let adapter: NodePtyAdapter | null = null;
	try {
		adapter = new NodePtyAdapter(term, meta);
		// Validate the private-fd dependency at spawn time, not handoff time.
		adapter.getMasterFd();
		return adapter;
	} catch (err) {
		// node-pty has already forked and opened the master fd at this point.
		// Tear down both a fully constructed adapter and a partial constructor
		// before returning the spawn failure to the caller.
		if (adapter) {
			try {
				adapter.kill("SIGKILL");
			} catch {
				// Disposal below still releases the native descriptor.
			}
			adapter.dispose();
		} else {
			try {
				term.kill("SIGKILL");
			} catch {
				// Continue with raw descriptor disposal.
			}
			try {
				(term as unknown as { destroy(): void }).destroy();
			} catch {
				// Preserve the original construction error.
			}
		}
		throw err;
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
 * - write via direct fs.writeSync calls
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
	private readonly reader: tty.ReadStream;
	private exitFired = false;
	private exitInfo: { code: number | null; signal: number | null } | null =
		null;
	private disposed = false;
	private livenessTimer: NodeJS.Timeout | null = null;
	private readonly killer: TreeKiller;
	private exitCallbacks: PtyOnExit[] = [];

	constructor(fd: number, pid: number, meta: SessionMeta) {
		this.fd = fd;
		this.pid = pid;
		this.meta = meta;
		this.killer = new TreeKiller(
			pid,
			() => !this.exitFired && isPidAlive(pid),
			(sig) => {
				// No node-pty here — signal the adopted root directly.
				try {
					process.kill(pid, sig);
				} catch {
					// already dead
				}
			},
		);
		void this.killer.captureIdentity();
		this.reader = new tty.ReadStream(fd);

		// onExit signal sources:
		//   1. read stream 'end' or 'error' — the slave-side close drives EOF
		//      / EIO on the master fd, which Node's stream surfaces as 'end'
		//      (EOF) or 'error' (EIO).
		//   2. PID-liveness poll — defense in depth for cases where the read
		//      stream lingers without firing 'end' promptly.
		const onExit = (info: { code: number | null; signal: number | null }) => {
			if (this.exitFired) return;
			this.exitFired = true;
			this.exitInfo = info;
			if (this.livenessTimer) {
				clearInterval(this.livenessTimer);
				this.livenessTimer = null;
			}
			this.dispose();
			for (const cb of this.exitCallbacks) cb(info);
		};
		this.reader.on("end", () => onExit({ code: null, signal: null }));
		this.reader.on("error", () => onExit({ code: null, signal: null }));
		this.livenessTimer = setInterval(() => {
			if (!isPidAlive(this.pid)) onExit({ code: null, signal: null });
		}, 1000);
		this.livenessTimer.unref();
	}

	dispose(options: DisposeOptions = {}): void {
		if (options.keepExitPolling === false && this.livenessTimer) {
			clearInterval(this.livenessTimer);
			this.livenessTimer = null;
		}
		if (this.disposed) return;
		this.disposed = true;
		// Normally leave livenessTimer running after an explicit dispose. Adopted
		// PTYs have no native exit event, so the poll must still deliver onExit to
		// let Server remove the session. Failed handoff rollback passes
		// keepExitPolling=false because that session is already untracked and the
		// predecessor's shell may intentionally remain alive indefinitely.
		// Do not touch TreeKiller or its pending escalation. Closing the adopted
		// stream releases only this daemon's inherited descriptor; kill() owns
		// process-tree signaling and may still be finishing in the background.
		try {
			this.reader.destroy();
		} catch {
			// The stream may already have closed after EOF/EIO.
		}
	}

	getMasterFd(): number {
		return this.fd;
	}

	write(data: Buffer): void {
		if (this.exitFired) {
			throw new Error(`session exited: ${this.pid}`);
		}
		let offset = 0;
		while (offset < data.byteLength) {
			const written = fs.writeSync(
				this.fd,
				data,
				offset,
				data.byteLength - offset,
			);
			if (written <= 0) {
				throw new Error(`pty write wrote ${written} bytes`);
			}
			offset += written;
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
	}

	kill(signal?: NodeJS.Signals): void {
		this.killer.kill(signal ?? "SIGHUP");
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

	pause(): void {
		if (this.exitFired || this.disposed) return;
		this.reader.pause();
	}

	resume(): void {
		if (this.exitFired || this.disposed) return;
		this.reader.resume();
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
	try {
		if (!Number.isInteger(pid) || pid <= 0) {
			throw new Error(`invalid pid: ${pid}`);
		}
		validateDims(meta.cols, meta.rows);
		return new AdoptedPty(fd, pid, meta);
	} catch (err) {
		// Ownership transfers once a valid fd reaches adoption. Close this
		// inherited copy on validation or construction failure; the predecessor
		// still owns its descriptor and can continue serving the live session.
		try {
			fs.closeSync(fd);
		} catch {
			// Preserve the adoption error.
		}
		throw err;
	}
}
