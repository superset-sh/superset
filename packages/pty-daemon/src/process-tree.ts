import { spawnSync } from "node:child_process";

export interface ProcessInfo {
	pid: number;
	ppid: number;
	pgid: number;
	/** Stable for one process lifetime; populated by readProcessTable(). */
	startTime?: string;
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
	/** Identities that proved ownership when this delayed target was captured. */
	witnesses: ProcessIdentity[];
}

export interface ProcessIdentity {
	pid: number;
	pgid: number;
	startTime: string;
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
	return collectProcessSignalTargetsFromTable(
		rootPid,
		options,
		readProcessTable(),
	);
}

/** Capture the kernel-observable identity for one process lifetime. */
export function captureProcessIdentity(
	pid: number,
	currentTable: ProcessInfo[] = readProcessTable(),
): ProcessIdentity | null {
	if (!isPositiveInteger(pid)) return null;
	const info = currentTable.find((row) => row.pid === pid);
	if (!info?.startTime) return null;
	return { pid: info.pid, pgid: info.pgid, startTime: info.startTime };
}

/** Exact identity comparison; PID equality alone is intentionally insufficient. */
export function processIdentityMatches(
	identity: ProcessIdentity,
	currentTable: ProcessInfo[] = readProcessTable(),
): boolean {
	const current = captureProcessIdentity(identity.pid, currentTable);
	return (
		current !== null &&
		current.pgid === identity.pgid &&
		current.startTime === identity.startTime
	);
}

export function sameProcessIdentity(
	left: ProcessIdentity,
	right: ProcessIdentity,
): boolean {
	return (
		left.pid === right.pid &&
		left.pgid === right.pgid &&
		left.startTime === right.startTime
	);
}

export function processIdentitySignalTarget(
	identity: ProcessIdentity,
): ProcessSignalTarget {
	return { target: "pid", id: identity.pid, witnesses: [identity] };
}

/**
 * Capture a process tree only when the root still has the expected lifetime.
 * The returned targets retain per-process identity witnesses for a later signal.
 */
export function collectProcessSignalTargetsForIdentity(
	identity: ProcessIdentity,
	options: SignalProcessTreeAndGroupsOptions = {},
	currentTable: ProcessInfo[] = readProcessTable(),
): ProcessSignalTarget[] {
	if (!processIdentityMatches(identity, currentTable)) return [];
	return collectProcessSignalTargetsFromTable(
		identity.pid,
		options,
		currentTable,
	);
}

function collectProcessSignalTargetsFromTable(
	rootPid: number,
	options: SignalProcessTreeAndGroupsOptions,
	table: ProcessInfo[],
): ProcessSignalTarget[] {
	const includeRoot = options.includeRoot ?? true;
	const signalGroups = options.signalGroups ?? true;
	const signalPids = options.signalPids ?? true;
	const excludeCurrentProcessGroup = options.excludeCurrentProcessGroup ?? true;
	const currentPgid = excludeCurrentProcessGroup
		? getProcessGroupId(process.pid, table)
		: null;
	const rootPgid = getProcessGroupId(rootPid, table);
	const pids = collectProcessTree(rootPid, table);
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
			targets.push({
				target: "pgid",
				id: pgid,
				witnesses: [...pids].flatMap((pid) => {
					const info = infoByPid.get(pid);
					return info?.pgid === pgid ? identityFor(info) : [];
				}),
			});
		}
	}

	if (signalPids) {
		for (const pid of pids) {
			if (!includeRoot && pid === rootPid) continue;
			const info = infoByPid.get(pid);
			targets.push({
				target: "pid",
				id: pid,
				witnesses: info ? identityFor(info) : [],
			});
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

/**
 * Delayed escalation is allowed only while an original process identity still
 * owns the pid/process group. This preserves descendant cleanup after the root
 * exits without ever signaling a recycled pid or pgid.
 */
export function signalProcessTargetsIfStillOwned(
	targets: ProcessSignalTarget[],
	signal: NodeJS.Signals,
	onSignalError?: (error: ProcessSignalError) => void,
	readCurrentTable: () => ProcessInfo[] = readProcessTable,
): ProcessSignalTarget[] {
	const signaled: ProcessSignalTarget[] = [];
	for (const target of targets) {
		// Re-read immediately before every individual signal. A single snapshot
		// for the whole batch leaves later targets exposed to PID/PGID recycling.
		if (
			filterOwnedProcessSignalTargets([target], readCurrentTable()).length === 0
		) {
			continue;
		}
		signalTarget(target.target, target.id, signal, onSignalError);
		signaled.push(target);
	}
	return signaled;
}

/**
 * Identity-fenced process-tree signal. Both capture and every actual signal
 * require an exact `(pid, pgid, startTime)` witness match.
 */
export function signalProcessTreeAndGroupsIfStillOwned(
	identity: ProcessIdentity,
	signal: NodeJS.Signals,
	options: SignalProcessTreeAndGroupsOptions = {},
	readCurrentTable: () => ProcessInfo[] = readProcessTable,
): ProcessSignalTarget[] {
	const targets = collectProcessSignalTargetsForIdentity(
		identity,
		options,
		readCurrentTable(),
	);
	return signalProcessTargetsIfStillOwned(
		targets,
		signal,
		options.onSignalError,
		readCurrentTable,
	);
}

/** @internal Exported for deterministic ownership tests. */
export function filterOwnedProcessSignalTargets(
	targets: ProcessSignalTarget[],
	currentTable: ProcessInfo[],
): ProcessSignalTarget[] {
	const currentByPid = new Map(currentTable.map((row) => [row.pid, row]));
	return targets.filter((target) =>
		target.witnesses.some((witness) => {
			const current = currentByPid.get(witness.pid);
			if (
				!current?.startTime ||
				current.startTime !== witness.startTime ||
				current.pgid !== witness.pgid
			) {
				return false;
			}
			return target.target === "pid"
				? current.pid === target.id
				: current.pgid === target.id;
		}),
	);
}

export function readProcessTable(): ProcessInfo[] {
	const result = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,lstart="], {
		encoding: "utf8",
	});
	if (result.error || result.status !== 0) return [];

	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			const [pidText, ppidText, pgidText, ...startTimeParts] =
				line.split(/\s+/);
			if (
				pidText === undefined ||
				ppidText === undefined ||
				pgidText === undefined
			) {
				return [];
			}
			const pid = Number(pidText);
			const ppid = Number(ppidText);
			const pgid = Number(pgidText);
			if (!isPositiveInteger(pid) || !Number.isInteger(ppid) || ppid < 0) {
				return [];
			}
			if (!isPositiveInteger(pgid)) return [];
			const startTime = startTimeParts.join(" ");
			if (!startTime) return [];
			return [{ pid, ppid, pgid, startTime }];
		});
}

function identityFor(info: ProcessInfo): ProcessIdentity[] {
	return info.startTime
		? [{ pid: info.pid, pgid: info.pgid, startTime: info.startTime }]
		: [];
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
