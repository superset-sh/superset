import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import pidtree from "pidtree";
import { getListeningPortsLinuxProcfs } from "./procfs.ts";

const execFileAsync = promisify(execFile);

/**
 * Run execFile and tolerate a plain non-zero exit by returning its stdout.
 * lsof exits 1 when no PIDs match the filter — a legitimate "empty" result.
 * Aborts, timeouts, and signal-kills are NOT tolerated: partial stdout from a
 * killed child is not a trustworthy snapshot, so rethrow and let the caller's
 * outer catch turn it into `[]`.
 */
async function runTolerant(
	file: string,
	args: string[],
	options: { maxBuffer: number; timeout: number; signal?: AbortSignal },
): Promise<string> {
	try {
		const { stdout } = await execFileAsync(file, args, options);
		return stdout;
	} catch (err) {
		if (err && typeof err === "object") {
			const execErr = err as {
				stdout?: string | Buffer;
				code?: unknown;
				killed?: boolean;
				signal?: unknown;
				name?: string;
			};
			if (
				execErr.name === "AbortError" ||
				execErr.code === "ABORT_ERR" ||
				execErr.killed ||
				execErr.signal
			) {
				throw err;
			}
			if ("stdout" in execErr) {
				return String(execErr.stdout ?? "");
			}
		}
		throw err;
	}
}

/** Timeout for shell commands to prevent hanging (ms) */
const EXEC_TIMEOUT_MS = 5000;

export interface PortInfo {
	port: number;
	pid: number;
	address: string;
	processName: string;
}

/**
 * Get the process tree (root + descendants) for each of the given root PIDs
 * using a single system-wide process-table read. pidtree spawns a full
 * `ps`/`wmic` per invocation, so calling it once per session made scan cost
 * scale linearly with session count.
 *
 * Roots that are no longer running are absent from the returned map. Throws
 * when the process table itself can't be read, so callers can keep previous
 * state instead of treating every session as exited.
 */
export async function getProcessTreesForPids(
	rootPids: number[],
): Promise<Map<number, number[]>> {
	const trees = new Map<number, number[]>();
	if (rootPids.length === 0) return trees;

	const table = await pidtree(-1, { advanced: true });

	const childrenByPpid = new Map<number, number[]>();
	const alivePids = new Set<number>();
	for (const { pid, ppid } of table) {
		alivePids.add(pid);
		const siblings = childrenByPpid.get(ppid);
		if (siblings) siblings.push(pid);
		else childrenByPpid.set(ppid, [pid]);
	}

	for (const rootPid of rootPids) {
		if (!alivePids.has(rootPid)) continue;
		const pids: number[] = [];
		const seen = new Set<number>();
		const stack = [rootPid];
		while (stack.length > 0) {
			const pid = stack.pop();
			if (pid === undefined || seen.has(pid)) continue;
			seen.add(pid);
			pids.push(pid);
			const children = childrenByPpid.get(pid);
			if (children) stack.push(...children);
		}
		trees.set(rootPid, pids);
	}

	return trees;
}

/**
 * Get listening TCP ports for a set of PIDs
 * Cross-platform implementation using lsof (macOS/Linux) or netstat (Windows)
 */
export async function getListeningPortsForPids(
	pids: number[],
	signal?: AbortSignal,
): Promise<PortInfo[]> {
	if (pids.length === 0) return [];

	const platform = os.platform();

	if (platform === "linux") {
		return getListeningPortsLinuxProcfs(pids, signal);
	}
	if (platform === "darwin") {
		return getListeningPortsLsof(pids, signal);
	}
	if (platform === "win32") {
		return getListeningPortsWindows(pids, signal);
	}

	return [];
}

/**
 * macOS/Linux implementation using lsof
 */
async function getListeningPortsLsof(
	pids: number[],
	signal?: AbortSignal,
): Promise<PortInfo[]> {
	try {
		const pidArg = pids.join(",");
		const pidSet = new Set(pids);
		// -a: AND the selectors — without it lsof ORs -p with -iTCP and
		//     walks every process on the machine, only to be filtered below
		// -p: filter by PIDs
		// -iTCP: only TCP connections
		// -sTCP:LISTEN: only listening sockets
		// -P: don't convert port numbers to names
		// -n: don't resolve hostnames
		const output = await runTolerant(
			"lsof",
			["-a", "-p", pidArg, "-iTCP", "-sTCP:LISTEN", "-P", "-n"],
			{ maxBuffer: 10 * 1024 * 1024, timeout: EXEC_TIMEOUT_MS, signal },
		);

		if (!output.trim()) return [];

		const ports: PortInfo[] = [];
		const lines = output.trim().split("\n").slice(1);

		for (const line of lines) {
			if (!line.trim()) continue;

			// Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
			// Example: node 12345 user 23u IPv4 0x1234 0t0 TCP *:3000 (LISTEN)
			const columns = line.split(/\s+/);
			const processName = columns[0];
			const pidStr = columns[1];
			const name = columns[columns.length - 2]; // before (LISTEN)
			if (
				columns.length < 10 ||
				processName === undefined ||
				pidStr === undefined ||
				name === undefined
			) {
				continue;
			}

			const pid = Number.parseInt(pidStr, 10);

			// Defense in depth: -a should guarantee only requested PIDs appear,
			// but a stray line must never attribute another process's port to a session
			if (!pidSet.has(pid)) continue;

			// Parse address:port from NAME column
			// Formats: *:3000, 127.0.0.1:3000, [::1]:3000, [::]:3000
			const match = name.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/);
			if (!match) continue;

			// match[3] is the mandatory port group; one of match[1]/[2] is the host.
			const portStr = match[3];
			if (portStr === undefined) continue;
			const address = match[1] || match[2] || "*";
			const port = Number.parseInt(portStr, 10);

			if (port < 1 || port > 65535) continue;

			ports.push({
				port,
				pid,
				address: address === "*" ? "0.0.0.0" : address,
				processName,
			});
		}

		return ports;
	} catch {
		return [];
	}
}

/**
 * Windows implementation using netstat
 */
async function getListeningPortsWindows(
	pids: number[],
	signal?: AbortSignal,
): Promise<PortInfo[]> {
	try {
		const { stdout: output } = await execFileAsync("netstat", ["-ano"], {
			maxBuffer: 10 * 1024 * 1024,
			timeout: EXEC_TIMEOUT_MS,
			signal,
		});

		const pidSet = new Set(pids);
		const ports: PortInfo[] = [];
		const processNames = new Map<number, string>();

		// Collect unique PIDs that we need to look up names for
		const pidsToLookup: number[] = [];

		for (const line of output.split("\n")) {
			if (!line.includes("LISTENING")) continue;

			// Format: TCP 0.0.0.0:3000 0.0.0.0:0 LISTENING 12345
			const columns = line.trim().split(/\s+/);
			const pidStr = columns[columns.length - 1];
			if (columns.length < 5 || pidStr === undefined) continue;

			const pid = Number.parseInt(pidStr, 10);
			if (!pidSet.has(pid)) continue;

			if (!processNames.has(pid) && !pidsToLookup.includes(pid)) {
				pidsToLookup.push(pid);
			}
		}

		// Fetch process names in parallel
		const nameResults = await Promise.all(
			pidsToLookup.map(async (pid) => ({
				pid,
				name: await getProcessNameWindows(pid, signal),
			})),
		);
		for (const { pid, name } of nameResults) {
			processNames.set(pid, name);
		}

		// Now build the ports array
		for (const line of output.split("\n")) {
			if (!line.includes("LISTENING")) continue;

			const columns = line.trim().split(/\s+/);
			const pidStr = columns[columns.length - 1];
			const localAddr = columns[1];
			if (columns.length < 5 || pidStr === undefined || localAddr === undefined)
				continue;

			const pid = Number.parseInt(pidStr, 10);
			if (!pidSet.has(pid)) continue;

			// Parse address:port - handles both IPv4 and IPv6
			// IPv4: 0.0.0.0:3000, IPv6: [::]:3000
			const match = localAddr.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/);
			if (!match) continue;

			const portStr = match[3];
			if (portStr === undefined) continue;
			const address = match[1] || match[2] || "0.0.0.0";
			const port = Number.parseInt(portStr, 10);

			if (port < 1 || port > 65535) continue;

			ports.push({
				port,
				pid,
				address,
				processName: processNames.get(pid) || "unknown",
			});
		}

		return ports;
	} catch {
		return [];
	}
}

/**
 * Get process name for a PID on Windows
 */
async function getProcessNameWindows(
	pid: number,
	signal?: AbortSignal,
): Promise<string> {
	try {
		const { stdout: output } = await execFileAsync(
			"wmic",
			["process", "where", `processid=${pid}`, "get", "name"],
			{ timeout: EXEC_TIMEOUT_MS, signal },
		);
		const lines = output.trim().split("\n");
		const secondLine = lines[1];
		if (secondLine) {
			const name = secondLine.trim();
			return name.replace(/\.exe$/i, "") || "unknown";
		}
	} catch {
		// wmic is deprecated, try PowerShell as fallback
		try {
			const { stdout: output } = await execFileAsync(
				"powershell",
				["-Command", `(Get-Process -Id ${pid}).ProcessName`],
				{ timeout: EXEC_TIMEOUT_MS, signal },
			);
			return output.trim() || "unknown";
		} catch {}
	}
	return "unknown";
}
