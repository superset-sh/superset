import { execFile, spawnSync } from "node:child_process";

export interface ProcessInfo {
	pid: number;
	ppid: number;
	pgid: number;
	/** Controlling terminal name as ps reports it (e.g. "ttys012"), or null for none ("??"). */
	tty: string | null;
}

export interface ProcessSignalError {
	target: "pid" | "pgid";
	id: number;
	signal: NodeJS.Signals;
	error: unknown;
}

export interface ProcessSignalTarget {
	target: "pid" | "pgid";
	id: number;
}

export interface SignalProcessTreeAndGroupsOptions {
	/**
	 * When false, skip the root pid and its process group. node-pty will
	 * deliver the signal to its own child separately; we only need to handle
	 * descendants and any detached process groups they spawned.
	 */
	includeRoot?: boolean;
	signalGroups?: boolean;
	signalPids?: boolean;
	excludeCurrentProcessGroup?: boolean;
	/**
	 * Also target live processes whose controlling terminal matches — catches
	 * descendants that reparented to pid 1 in a new process group but kept
	 * the session's tty.
	 */
	ttyName?: string | null;
	/**
	 * Also target live members of these process groups — groups recorded on
	 * earlier kill passes. A ppid walk can't rediscover a group once its
	 * last tree-reachable member died, but reparented stragglers keep it.
	 */
	knownPgids?: ReadonlySet<number>;
	/**
	 * Pre-read process table. Pass one (from readProcessTableAsync) when
	 * calling from the daemon's async paths — the sync fallback blocks the
	 * event loop for the duration of a ps spawn.
	 */
	table?: ProcessInfo[];
	onSignalError?: (error: ProcessSignalError) => void;
}

export function signalProcessTreeAndGroups(
	rootPid: number,
	signal: NodeJS.Signals,
	options: SignalProcessTreeAndGroupsOptions = {},
): ProcessSignalTarget[] {
	const targets = collectProcessSignalTargets(rootPid, options);
	signalProcessTargets(targets, signal, options.onSignalError);
	return targets;
}

export function collectProcessSignalTargets(
	rootPid: number,
	options: SignalProcessTreeAndGroupsOptions = {},
): ProcessSignalTarget[] {
	if (!isPositiveInteger(rootPid)) return [];

	const includeRoot = options.includeRoot ?? true;
	const signalGroups = options.signalGroups ?? true;
	const signalPids = options.signalPids ?? true;
	const excludeCurrentProcessGroup = options.excludeCurrentProcessGroup ?? true;
	const table = options.table ?? readProcessTable();
	const currentPgid = excludeCurrentProcessGroup
		? getProcessGroupId(process.pid, table)
		: null;
	const rootPgid = getProcessGroupId(rootPid, table);
	const pids = collectProcessTree(rootPid, table);
	for (const row of table) {
		if (pids.has(row.pid)) continue;
		if (row.pid === process.pid) continue;
		if (currentPgid !== null && row.pgid === currentPgid) continue;
		const onSessionTty = options.ttyName != null && row.tty === options.ttyName;
		const inKnownGroup = options.knownPgids?.has(row.pgid) ?? false;
		if (onSessionTty || inKnownGroup) pids.add(row.pid);
	}
	const infoByPid = new Map(table.map((row) => [row.pid, row]));
	const pgids = new Set<number>();
	const targets: ProcessSignalTarget[] = [];

	for (const pid of pids) {
		if (!includeRoot && pid === rootPid) continue;
		const info = infoByPid.get(pid);
		if (!info) continue;
		if (info.pgid <= 1) continue;
		if (currentPgid !== null && info.pgid === currentPgid) continue;
		if (!includeRoot && rootPgid !== null && info.pgid === rootPgid) {
			continue;
		}
		pgids.add(info.pgid);
	}

	if (signalGroups) {
		for (const pgid of pgids) {
			targets.push({ target: "pgid", id: pgid });
		}
	}

	if (signalPids) {
		for (const pid of pids) {
			if (!includeRoot && pid === rootPid) continue;
			targets.push({ target: "pid", id: pid });
		}
	}

	return targets;
}

export function signalProcessTargets(
	targets: ProcessSignalTarget[],
	signal: NodeJS.Signals,
	onSignalError?: (error: ProcessSignalError) => void,
): void {
	for (const { target, id } of targets) {
		signalTarget(target, id, signal, onSignalError);
	}
}

const PS_TABLE_ARGS = ["-axo", "pid=,ppid=,pgid=,tty=,stat="];
// Bound every ps: a hung ps (stale NFS mount, kernel proc stalls) must fail
// the read, not wedge the kill chain or the daemon shutdown drain.
const PS_TIMEOUT_MS = 5_000;

export function readProcessTable(): ProcessInfo[] {
	const result = spawnSync("ps", PS_TABLE_ARGS, {
		encoding: "utf8",
		timeout: PS_TIMEOUT_MS,
	});
	if (result.error || result.status !== 0) return [];
	return parseProcessTable(result.stdout);
}

/**
 * Resolves null when ps itself fails — callers making liveness decisions
 * (e.g. "no survivors, stop escalating") must treat null as unknown, never
 * as an empty table.
 */
export function readProcessTableAsync(): Promise<ProcessInfo[] | null> {
	return new Promise((resolve) => {
		execFile(
			"ps",
			PS_TABLE_ARGS,
			{ encoding: "utf8", timeout: PS_TIMEOUT_MS },
			(error, stdout) => {
				resolve(error ? null : parseProcessTable(stdout));
			},
		);
	});
}

export function parseProcessTable(stdout: string): ProcessInfo[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			const [pidText, ppidText, pgidText, ttyText, statText] =
				line.split(/\s+/);
			if (
				pidText === undefined ||
				ppidText === undefined ||
				pgidText === undefined
			) {
				return [];
			}
			// Zombies are unkillable and childless (their children already
			// reparented); including them would make verify passes see
			// permanent "survivors".
			if (statText?.startsWith("Z")) return [];
			const pid = Number(pidText);
			const ppid = Number(ppidText);
			const pgid = Number(pgidText);
			if (!isPositiveInteger(pid) || !Number.isInteger(ppid) || ppid < 0) {
				return [];
			}
			if (!isPositiveInteger(pgid)) return [];
			return [{ pid, ppid, pgid, tty: normalizeTtyName(ttyText) }];
		});
}

/**
 * Process group + controlling terminal of a process (tty e.g. "ttys012",
 * null if none). Captured at session spawn so later kill passes can target
 * stragglers by group membership or tty after the ppid tree is gone.
 * Async on purpose: this runs on the daemon's session-open path, where a
 * spawnSync would stall every session's output for the ps duration.
 */
export function getProcessGroupAndTty(
	pid: number,
): Promise<{ pgid: number | null; tty: string | null }> {
	if (!isPositiveInteger(pid))
		return Promise.resolve({ pgid: null, tty: null });
	return new Promise((resolve) => {
		execFile(
			"ps",
			["-o", "pgid=,tty=", "-p", String(pid)],
			{ encoding: "utf8", timeout: PS_TIMEOUT_MS },
			(error, stdout) => {
				if (error) return resolve({ pgid: null, tty: null });
				const [pgidText, ttyText] = stdout.trim().split(/\s+/);
				const pgid = Number(pgidText);
				resolve({
					pgid: isPositiveInteger(pgid) ? pgid : null,
					tty: normalizeTtyName(ttyText),
				});
			},
		);
	});
}

function normalizeTtyName(raw: string | undefined): string | null {
	if (!raw) return null;
	// ps prints "??" (macOS) or "?" (Linux) for processes with no
	// controlling terminal; "-" shows up in some BSD ps variants.
	if (raw === "??" || raw === "?" || raw === "-") return null;
	return raw;
}

/**
 * Whether a foreground command (something other than the shell's own prompt) is
 * currently running in the shell's controlling terminal.
 *
 * Uses the tty's foreground process group (`tpgid`): at an idle prompt it equals
 * the shell's own process group; while a command runs in the foreground the
 * shell has handed the terminal to the command's group, so they differ. This is
 * precise — unlike a "shell has descendants" check it does not false-positive on
 * suspended or background jobs. Fails closed (returns false) on any ps error.
 */
export function hasRunningForegroundProcess(shellPid: number): boolean {
	if (!isPositiveInteger(shellPid)) return false;

	const result = spawnSync(
		"ps",
		["-o", "tpgid=", "-o", "pgid=", "-p", String(shellPid)],
		{ encoding: "utf8" },
	);
	if (result.error || result.status !== 0) return false;

	const [tpgidText, pgidText] = result.stdout.trim().split(/\s+/);
	const tpgid = Number(tpgidText);
	const pgid = Number(pgidText);
	if (!isPositiveInteger(tpgid) || !isPositiveInteger(pgid)) return false;

	return tpgid !== pgid;
}

export function collectProcessTree(
	rootPid: number,
	table: ProcessInfo[],
): Set<number> {
	const pids = new Set<number>([rootPid]);
	const childrenByParent = new Map<number, ProcessInfo[]>();
	for (const row of table) {
		const children = childrenByParent.get(row.ppid) ?? [];
		children.push(row);
		childrenByParent.set(row.ppid, children);
	}

	const queue = [rootPid];
	for (const pid of queue) {
		for (const child of childrenByParent.get(pid) ?? []) {
			if (pids.has(child.pid)) continue;
			pids.add(child.pid);
			queue.push(child.pid);
		}
	}

	return pids;
}

export function getProcessGroupId(
	pid: number,
	table: ProcessInfo[],
): number | null {
	return table.find((row) => row.pid === pid)?.pgid ?? null;
}

export function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function signalTarget(
	target: "pid" | "pgid",
	id: number,
	signal: NodeJS.Signals,
	onSignalError: SignalProcessTreeAndGroupsOptions["onSignalError"],
): void {
	try {
		process.kill(target === "pgid" ? -id : id, signal);
	} catch (error) {
		onSignalError?.({ target, id, signal, error });
	}
}
