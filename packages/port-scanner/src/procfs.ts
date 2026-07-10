import { promises as fs } from "node:fs";
import type { PortInfo } from "./scanner.ts";

/**
 * Linux-only: resolve listening TCP ports for a set of PIDs by reading
 * /proc directly. Replaces spawning `lsof` on each scan.
 *
 * Why: on a busy host, `lsof -p <pids> -iTCP -sTCP:LISTEN` forks a child,
 * opens every /proc fd anyway, then writes ~200 KiB of text we re-parse.
 * Doing the same work in-process with two file reads and one directory walk
 * cuts the per-scan cost by ~10× and eliminates the child-process lifecycle
 * (timeouts, aborts, stdout buffering).
 *
 * Shape of the problem:
 *   1. /proc/net/tcp{,6}   listener rows → (local_address, state, inode)
 *   2. /proc/<pid>/fd/*    symlinks to "socket:[<inode>]" → inode → pid
 *   3. Join on inode, filter state === "0A" (TCP_LISTEN), drop entries
 *      whose inode we don't own.
 *
 * Parallels: this is the same approach VS Code uses for its remote tunnel
 * port detection (src/vs/workbench/contrib/remoteTunnel). We keep the
 * parsing in TypeScript rather than a binary helper so there's nothing to
 * bundle for the host-service runtime.
 */

/** Linux kernel TCP state code for LISTEN. See include/net/tcp_states.h. */
const TCP_STATE_LISTEN = "0A";

/** Keep procfs fd symlink reads bounded across all scanned PIDs. */
const FD_READLINK_CONCURRENCY = 64;

interface ProcNetListener {
	port: number;
	inode: number;
	address: string;
}

/**
 * Parse an IPv4 address from the hex form used in /proc/net/tcp. Each byte
 * is little-endian, so "0100007F" decodes to 127.0.0.1, not 1.0.0.127.
 */
export function parseIPv4Hex(hex: string): string | null {
	if (hex.length !== 8) return null;
	const b0 = Number.parseInt(hex.slice(6, 8), 16);
	const b1 = Number.parseInt(hex.slice(4, 6), 16);
	const b2 = Number.parseInt(hex.slice(2, 4), 16);
	const b3 = Number.parseInt(hex.slice(0, 2), 16);
	if (
		!Number.isFinite(b0) ||
		!Number.isFinite(b1) ||
		!Number.isFinite(b2) ||
		!Number.isFinite(b3)
	) {
		return null;
	}
	return `${b0}.${b1}.${b2}.${b3}`;
}

/**
 * Parse an IPv6 address from the hex form in /proc/net/tcp6. The kernel
 * writes four 32-bit words, each in little-endian byte order within the
 * word — so "0000000000000000FFFF00000100007F" is ::ffff:127.0.0.1, not a
 * nonsense string. We render the canonical long form (e.g. "0:0:0:0:0:0:0:1")
 * rather than RFC 5952's "::1" because consumers just forward this to URL
 * builders that tolerate either.
 */
export function parseIPv6Hex(hex: string): string | null {
	if (hex.length !== 32) return null;
	const groups: string[] = [];
	for (let wordIdx = 0; wordIdx < 4; wordIdx++) {
		const word = hex.slice(wordIdx * 8, (wordIdx + 1) * 8);
		// Reverse the 4 bytes of this word into network byte order.
		const be =
			word.slice(6, 8) + word.slice(4, 6) + word.slice(2, 4) + word.slice(0, 2);
		groups.push(be.slice(0, 4), be.slice(4, 8));
	}
	// Strip leading zeros per group but leave at least one digit.
	return groups.map((g) => g.replace(/^0+/, "") || "0").join(":");
}

/**
 * Parse a single /proc/net/tcp or /proc/net/tcp6 line into a listener record.
 * Returns null for header lines, non-LISTEN states, or malformed rows.
 *
 * Exported for testing — reading real /proc in unit tests is noisy, so we
 * feed canned lines here instead.
 */
export function parseProcNetLine(
	line: string,
	isIPv6: boolean,
): ProcNetListener | null {
	const cols = line.trim().split(/\s+/);
	// Kernel writes at least 17 columns (sl, local, remote, state, tx_queue,
	// rx_queue, tr, tm_when, retrnsmt, uid, timeout, inode, ...). We only
	// need up to column 10 (inode).
	const localAddr = cols[1];
	const state = cols[3];
	const inodeStr = cols[9];
	if (
		cols.length < 10 ||
		localAddr === undefined ||
		state === undefined ||
		inodeStr === undefined
	) {
		return null;
	}
	if (state !== TCP_STATE_LISTEN) return null;

	const colonIdx = localAddr.lastIndexOf(":");
	if (colonIdx < 0) return null;
	const hexIP = localAddr.slice(0, colonIdx);
	const hexPort = localAddr.slice(colonIdx + 1);

	const port = Number.parseInt(hexPort, 16);
	if (!Number.isFinite(port) || port < 1 || port > 65535) return null;

	const inode = Number.parseInt(inodeStr, 10);
	if (!Number.isFinite(inode) || inode <= 0) return null;

	const address = isIPv6 ? parseIPv6Hex(hexIP) : parseIPv4Hex(hexIP);
	if (address === null) return null;

	return { port, inode, address };
}

async function readProcNetFile(
	path: string,
	isIPv6: boolean,
): Promise<ProcNetListener[]> {
	let content: string;
	try {
		content = await fs.readFile(path, "utf-8");
	} catch {
		// /proc/net/tcp6 may not exist on IPv6-disabled kernels — silent skip.
		return [];
	}

	const listeners: ProcNetListener[] = [];
	// Skip the header row.
	const lines = content.split("\n").slice(1);
	for (const line of lines) {
		if (!line.trim()) continue;
		const parsed = parseProcNetLine(line, isIPv6);
		if (parsed) listeners.push(parsed);
	}
	return listeners;
}

function createLimiter(
	concurrency: number,
): <T>(fn: () => Promise<T>) => Promise<T> {
	let active = 0;
	const queue: Array<() => void> = [];

	return async <T>(fn: () => Promise<T>): Promise<T> => {
		if (active >= concurrency) {
			await new Promise<void>((resolve) => {
				queue.push(resolve);
			});
		}

		active++;
		try {
			return await fn();
		} finally {
			active--;
			queue.shift()?.();
		}
	};
}

/**
 * Walk /proc/<pid>/fd/ for each PID we care about and build an inode → pid
 * map. We ignore fds we can't read — they may have been closed between
 * readdir and readlink (fd table races), or the process may have exited.
 */
async function buildInodeToPid(
	pids: Iterable<number>,
	pidRank: Map<number, number>,
	signal?: AbortSignal,
): Promise<Map<number, number>> {
	const inodeToPid = new Map<number, number>();
	const limitReadlink = createLimiter(FD_READLINK_CONCURRENCY);

	await Promise.all(
		Array.from(pids, async (pid) => {
			signal?.throwIfAborted();
			let entries: string[];
			try {
				entries = await fs.readdir(`/proc/${pid}/fd`);
			} catch {
				// Process exited, or we lack permission for another user's fds.
				return;
			}

			await Promise.all(
				entries.map((fd) =>
					limitReadlink(async () => {
						signal?.throwIfAborted();
						try {
							const link = await fs.readlink(`/proc/${pid}/fd/${fd}`);
							const match = link.match(/^socket:\[(\d+)\]$/);
							const inodeStr = match?.[1];
							if (inodeStr === undefined) return;
							const inode = Number.parseInt(inodeStr, 10);
							if (!Number.isFinite(inode) || inode <= 0) return;
							// If multiple PIDs share a listening socket (prefork
							// servers, inherited fds), choose deterministically from
							// the caller's PID order instead of whichever async
							// readlink finishes last. This keeps port identity stable
							// across scans.
							const existingPid = inodeToPid.get(inode);
							if (
								existingPid === undefined ||
								(pidRank.get(pid) ?? Number.POSITIVE_INFINITY) <
									(pidRank.get(existingPid) ?? Number.POSITIVE_INFINITY)
							) {
								inodeToPid.set(inode, pid);
							}
						} catch {
							// fd closed between readdir and readlink — normal.
						}
					}),
				),
			);
		}),
	);

	return inodeToPid;
}

/** Read /proc/<pid>/comm — kernel stores the task name (max 15 chars + NUL). */
async function readProcessName(pid: number): Promise<string> {
	try {
		const content = await fs.readFile(`/proc/${pid}/comm`, "utf-8");
		return content.trim() || "unknown";
	} catch {
		return "unknown";
	}
}

/**
 * Linux implementation of `getListeningPortsForPids` backed by /proc.
 * Returns an empty array if /proc reads fail — caller treats empty as
 * "nothing listening" identically to the lsof path, so there's no need
 * to distinguish failures from genuine empties.
 */
export async function getListeningPortsLinuxProcfs(
	pids: number[],
	signal?: AbortSignal,
): Promise<PortInfo[]> {
	if (pids.length === 0) return [];

	const pidSet = new Set(pids);
	const pidRank = new Map(pids.map((pid, index) => [pid, index]));

	try {
		// Walk fds and read /proc/net/tcp{,6} concurrently — they're independent.
		const [inodeToPid, ipv4Listeners, ipv6Listeners] = await Promise.all([
			buildInodeToPid(pidSet, pidRank, signal),
			readProcNetFile("/proc/net/tcp", false),
			readProcNetFile("/proc/net/tcp6", true),
		]);

		if (inodeToPid.size === 0) return [];

		const nameCache = new Map<number, string>();
		const matches: PortInfo[] = [];
		for (const listener of [...ipv4Listeners, ...ipv6Listeners]) {
			const pid = inodeToPid.get(listener.inode);
			if (pid === undefined) continue;

			let processName = nameCache.get(pid);
			if (processName === undefined) {
				processName = await readProcessName(pid);
				nameCache.set(pid, processName);
			}

			matches.push({
				port: listener.port,
				pid,
				address: listener.address,
				processName,
			});
		}

		return matches;
	} catch (err) {
		if (signal?.aborted) throw err;
		return [];
	}
}
