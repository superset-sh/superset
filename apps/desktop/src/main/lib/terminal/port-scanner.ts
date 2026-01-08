import { exec } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import pidtree from "pidtree";

const execAsync = promisify(exec);

/** Timeout for shell commands to prevent hanging (ms) */
const EXEC_TIMEOUT_MS = 5000;

export interface PortInfo {
	port: number;
	pid: number;
	address: string;
	processName: string;
}

/**
 * Get all child PIDs of a process (including the process itself)
 */
export async function getProcessTree(pid: number): Promise<number[]> {
	try {
		return await pidtree(pid, { root: true });
	} catch {
		// Process may have exited
		return [];
	}
}

/**
 * Get listening TCP ports for a set of PIDs
 * Cross-platform implementation using lsof (macOS/Linux) or netstat (Windows)
 */
export async function getListeningPortsForPids(
	pids: number[],
): Promise<PortInfo[]> {
	if (pids.length === 0) return [];

	const platform = os.platform();

	if (platform === "darwin" || platform === "linux") {
		return getListeningPortsLsof(pids);
	}
	if (platform === "win32") {
		return getListeningPortsWindows(pids);
	}

	return [];
}

/**
 * macOS/Linux implementation using lsof
 */
async function getListeningPortsLsof(pids: number[]): Promise<PortInfo[]> {
	try {
		const pidArg = pids.join(",");
		const pidSet = new Set(pids);
		// -p: filter by PIDs
		// -iTCP: only TCP connections
		// -sTCP:LISTEN: only listening sockets
		// -P: don't convert port numbers to names
		// -n: don't resolve hostnames
		// Note: lsof may ignore -p filter if PIDs don't exist or have no matches,
		// so we must validate PIDs in the output against our requested set
		const { stdout: output } = await execAsync(
			`lsof -p ${pidArg} -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true`,
			{ maxBuffer: 10 * 1024 * 1024, timeout: EXEC_TIMEOUT_MS },
		);

		if (!output.trim()) return [];

		const ports: PortInfo[] = [];
		const lines = output.trim().split("\n").slice(1);

		for (const line of lines) {
			if (!line.trim()) continue;

			// Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
			// Example: node 12345 user 23u IPv4 0x1234 0t0 TCP *:3000 (LISTEN)
			const columns = line.split(/\s+/);
			if (columns.length < 10) continue;

			const processName = columns[0];
			const pid = Number.parseInt(columns[1], 10);

			// CRITICAL: Verify the PID is in our requested set
			// lsof ignores -p filter when PIDs don't exist, returning all TCP listeners
			if (!pidSet.has(pid)) continue;

			const name = columns[columns.length - 2]; // NAME column (e.g., *:3000), before (LISTEN)

			// Parse address:port from NAME column
			// Formats: *:3000, 127.0.0.1:3000, [::1]:3000, [::]:3000
			const match = name.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/);
			if (match) {
				const address = match[1] || match[2] || "*";
				const port = Number.parseInt(match[3], 10);

				if (port < 1 || port > 65535) continue;

				ports.push({
					port,
					pid,
					address: address === "*" ? "0.0.0.0" : address,
					processName,
				});
			}
		}

		return ports;
	} catch {
		return [];
	}
}

/**
 * Windows implementation using netstat
 */
async function getListeningPortsWindows(pids: number[]): Promise<PortInfo[]> {
	try {
		const { stdout: output } = await execAsync("netstat -ano", {
			maxBuffer: 10 * 1024 * 1024,
			timeout: EXEC_TIMEOUT_MS,
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
			if (columns.length < 5) continue;

			const pid = Number.parseInt(columns[columns.length - 1], 10);
			if (!pidSet.has(pid)) continue;

			if (!processNames.has(pid) && !pidsToLookup.includes(pid)) {
				pidsToLookup.push(pid);
			}
		}

		// Fetch process names in parallel
		const nameResults = await Promise.all(
			pidsToLookup.map(async (pid) => ({
				pid,
				name: await getProcessNameWindows(pid),
			})),
		);
		for (const { pid, name } of nameResults) {
			processNames.set(pid, name);
		}

		// Now build the ports array
		for (const line of output.split("\n")) {
			if (!line.includes("LISTENING")) continue;

			const columns = line.trim().split(/\s+/);
			if (columns.length < 5) continue;

			const pid = Number.parseInt(columns[columns.length - 1], 10);
			if (!pidSet.has(pid)) continue;

			const localAddr = columns[1];
			// Parse address:port - handles both IPv4 and IPv6
			// IPv4: 0.0.0.0:3000
			// IPv6: [::]:3000
			const match = localAddr.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/);
			if (match) {
				const address = match[1] || match[2] || "0.0.0.0";
				const port = Number.parseInt(match[3], 10);

				if (port < 1 || port > 65535) continue;

				ports.push({
					port,
					pid,
					address,
					processName: processNames.get(pid) || "unknown",
				});
			}
		}

		return ports;
	} catch {
		return [];
	}
}

/**
 * Get process name for a PID on Windows
 */
async function getProcessNameWindows(pid: number): Promise<string> {
	try {
		const { stdout: output } = await execAsync(
			`wmic process where processid=${pid} get name 2>nul`,
			{ timeout: EXEC_TIMEOUT_MS },
		);
		const lines = output.trim().split("\n");
		if (lines.length >= 2) {
			const name = lines[1].trim();
			return name.replace(/\.exe$/i, "") || "unknown";
		}
	} catch {
		// wmic is deprecated, try PowerShell as fallback
		try {
			const { stdout: output } = await execAsync(
				`powershell -Command "(Get-Process -Id ${pid}).ProcessName"`,
				{ timeout: EXEC_TIMEOUT_MS },
			);
			return output.trim() || "unknown";
		} catch {}
	}
	return "unknown";
}

/**
 * Get process name for a PID (cross-platform)
 */
export async function getProcessName(pid: number): Promise<string> {
	const platform = os.platform();

	if (platform === "win32") {
		return getProcessNameWindows(pid);
	}

	// macOS/Linux
	try {
		const { stdout: output } = await execAsync(
			`ps -p ${pid} -o comm= 2>/dev/null || true`,
			{ timeout: EXEC_TIMEOUT_MS },
		);
		const name = output.trim();
		// On macOS, comm may be truncated. The full path can be gotten with -o command=
		// but comm is usually sufficient for display purposes
		return name || "unknown";
	} catch {
		return "unknown";
	}
}
