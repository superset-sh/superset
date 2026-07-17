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
 * The session root's durable coordinates: controlling tty plus every process
 * group ever observed for it. A ppid walk can't rediscover either once the
 * intermediate parents die, so kill passes target through these too.
 */
interface RootIdentity {
	ttyName: string | null;
	knownPgids: Set<number>;
}

/**
 * One kill pass: collect the current tree + known-group members + same-tty
 * stragglers, record the root's and any newly seen groups, signal everything.
 * The root pid itself is excluded — each adapter signals its root its own way.
 * Pass a pre-read `table` from async paths; the sync fallback (one ps, same
 * cost as the pre-hardening kill) is for the synchronous kill() entrypoint.
 */
function killVolley(
	rootPid: number,
	signal: NodeJS.Signals,
	identity: RootIdentity,
	table?: ProcessInfo[],
): { survivors: boolean } {
	const psTable = table ?? readProcessTable();
	const rootRow = psTable.find((r) => r.pid === rootPid);
	if (rootRow) {
		if (rootRow.tty !== null) identity.ttyName = rootRow.tty;
		identity.knownPgids.add(rootRow.pgid);
	}
	const targets = collectProcessSignalTargets(rootPid, {
		includeRoot: false,
		// tty targeting only while the root is alive in this same snapshot:
		// the kernel recycles the pty slot the moment the master fd closes,
		// so after root death a tty match can only ever hit a NEW session
		// that inherited the slot (legit stragglers show "??" by then).
		ttyName: rootRow ? identity.ttyName : null,
		knownPgids: identity.knownPgids,
		table: psTable,
		onSignalError: logProcessSignalError,
	});
	for (const t of targets) {
		if (t.target === "pgid") identity.knownPgids.add(t.id);
	}
	signalProcessTargets(targets, signal, logProcessSignalError);
	return { survivors: targets.some((t) => t.target === "pid") };
}

interface KillEscalationOptions {
	rootPid: number;
	identity: RootIdentity;
	isRootAlive: () => boolean;
	/** Best-effort SIGKILL to the root process itself. */
	killRoot: () => void;
}

/**
 * SIGKILL escalation with a fresh process-table snapshot each round: the
 * initial volley's target list goes stale the moment a descendant forks, so
 * every pass re-collects (tree walk + known pgids + tty) and repeats until
 * nothing is left or the round budget runs out. Timers stay ref'd on purpose:
 * a naturally-exiting daemon must not drop a half-finished kill.
 */
async function runKillEscalation(opts: KillEscalationOptions): Promise<void> {
	const { rootPid, identity, isRootAlive, killRoot } = opts;
	await delay(KILL_ESCALATION_TIMEOUT_MS);
	for (let round = 0; ; round++) {
		const table = await readProcessTableAsync();
		const rootAlive = isRootAlive();
		if (table !== null) {
			const { survivors } = killVolley(rootPid, "SIGKILL", identity, table);
			if (!survivors && !rootAlive) return;
		}
		// A null table means ps failed — state unknown; keep the root kill
		// and burn a round rather than concluding the kill is complete.
		if (rootAlive) killRoot();
		const nextDelay = KILL_VERIFY_DELAYS_MS[round];
		if (nextDelay === undefined) break;
		await delay(nextDelay);
	}
	// Let the final volley's SIGKILLs land before declaring survivors.
	await delay(300);
	const finalTable = await readProcessTableAsync();
	if (finalTable === null) {
		process.stderr.write(
			`[pty-daemon] kill escalation for pid ${rootPid}: final ps failed, survivor state unknown\n`,
		);
		return;
	}
	const finalRootRow = finalTable.find((r) => r.pid === rootPid);
	const leftovers = collectProcessSignalTargets(rootPid, {
		includeRoot: false,
		ttyName: finalRootRow ? identity.ttyName : null,
		knownPgids: identity.knownPgids,
		table: finalTable,
	}).filter((t) => t.target === "pid");
	if (leftovers.length > 0 || isRootAlive()) {
		process.stderr.write(
			`[pty-daemon] kill escalation for pid ${rootPid} left survivors: ` +
				`root=${isRootAlive()} pids=[${leftovers.map((t) => t.id).join(",")}]\n`,
		);
	}
}

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
	private readonly identity: RootIdentity = {
		ttyName: null,
		knownPgids: new Set(),
	};
	private killChain: Promise<void> | null = null;
	private exitInfo: { code: number | null; signal: number | null } | null =
		null;
	private exitCallbacks: PtyOnExit[] = [];

	constructor(term: nodePty.IPty, meta: SessionMeta) {
		this.term = term;
		this.pid = term.pid;
		this.meta = meta;
		// Capture the group + tty: if the shell exits before the first kill,
		// a ppid walk can't rediscover either, and orphans reparented to
		// pid 1 keep the root pgid. Async — this is the session-open path.
		// The immediate capture races the child's setsid/login_tty (it may
		// still show the daemon's own pgid — collect's current-pgid guard
		// covers that — and no tty), so re-capture once the child has
		// certainly run; kill volleys refresh again from their own table.
		void this.captureRootIdentity();
		setTimeout(() => {
			if (!this.exited) void this.captureRootIdentity();
		}, 100).unref();
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
		killVolley(this.pid, killSignal, this.identity);
		try {
			this.term.kill(killSignal);
		} catch {
			// PTY root may have already exited; detached targets still matter.
		}
		this.startKillEscalation(killSignal);
	}

	private async captureRootIdentity(): Promise<void> {
		const { pgid, tty: ttyName } = await getProcessGroupAndTty(this.pid);
		if (ttyName !== null) this.identity.ttyName = ttyName;
		if (pgid !== null) this.identity.knownPgids.add(pgid);
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

	private startKillEscalation(signal: NodeJS.Signals): void {
		if (signal === "SIGKILL" || this.killChain) return;
		const chain = registerPendingKill(
			runKillEscalation({
				rootPid: this.pid,
				identity: this.identity,
				isRootAlive: () => !this.exited,
				killRoot: () => {
					try {
						this.term.kill("SIGKILL");
					} catch {
						// already exited
					}
				},
			}),
		);
		this.killChain = chain;
		// Reset when done so a retried close can escalate again.
		void chain.then(() => {
			if (this.killChain === chain) this.killChain = null;
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
	private livenessTimer: NodeJS.Timeout | null = null;
	private readonly identity: RootIdentity = {
		ttyName: null,
		knownPgids: new Set(),
	};
	private killChain: Promise<void> | null = null;
	private exitCallbacks: PtyOnExit[] = [];

	constructor(fd: number, pid: number, meta: SessionMeta) {
		this.fd = fd;
		this.pid = pid;
		this.meta = meta;
		void this.captureRootIdentity();
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
			if (this.livenessTimer) clearInterval(this.livenessTimer);
			// tty.ReadStream owns the inherited fd; destroying the stream closes it.
			try {
				this.reader.destroy();
			} catch {
				// already closed
			}
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
		const killSignal = signal ?? "SIGHUP";
		killVolley(this.pid, killSignal, this.identity);
		// No node-pty here — signal the adopted root directly.
		try {
			process.kill(this.pid, killSignal);
		} catch {
			// already dead
		}
		this.startKillEscalation(killSignal);
	}

	private async captureRootIdentity(): Promise<void> {
		const { pgid, tty: ttyName } = await getProcessGroupAndTty(this.pid);
		if (ttyName !== null) this.identity.ttyName = ttyName;
		if (pgid !== null) this.identity.knownPgids.add(pgid);
	}

	onData(cb: PtyOnData): void {
		this.reader.on("data", (chunk) => {
			cb(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
		});
	}

	onExit(cb: PtyOnExit): void {
		this.exitCallbacks.push(cb);
	}

	private startKillEscalation(signal: NodeJS.Signals): void {
		if (signal === "SIGKILL" || this.killChain) return;
		const chain = registerPendingKill(
			runKillEscalation({
				rootPid: this.pid,
				identity: this.identity,
				isRootAlive: () => !this.exitFired && isPidAlive(this.pid),
				killRoot: () => {
					try {
						process.kill(this.pid, "SIGKILL");
					} catch {
						// already dead
					}
				},
			}),
		);
		this.killChain = chain;
		// Reset when done so a retried close can escalate again.
		void chain.then(() => {
			if (this.killChain === chain) this.killChain = null;
		});
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
