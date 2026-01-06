import { execSync } from "node:child_process";
import os from "node:os";
import pidtree from "pidtree";

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
export function getListeningPortsForPids(pids: number[]): PortInfo[] {
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
function getListeningPortsLsof(pids: number[]): PortInfo[] {
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
		const output = execSync(
			`lsof -p ${pidArg} -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true`,
			{ encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
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
function getListeningPortsWindows(pids: number[]): PortInfo[] {
	try {
		const output = execSync("netstat -ano", {
			encoding: "utf-8",
			maxBuffer: 10 * 1024 * 1024,
		});

		const pidSet = new Set(pids);
		const ports: PortInfo[] = [];
		const processNames = new Map<number, string>();

		for (const line of output.split("\n")) {
			if (!line.includes("LISTENING")) continue;

			// Format: TCP 0.0.0.0:3000 0.0.0.0:0 LISTENING 12345
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

				if (!processNames.has(pid)) {
					processNames.set(pid, getProcessNameWindows(pid));
				}

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
function getProcessNameWindows(pid: number): string {
	try {
		const output = execSync(
			`wmic process where processid=${pid} get name 2>nul`,
			{ encoding: "utf-8" },
		);
		const lines = output.trim().split("\n");
		if (lines.length >= 2) {
			const name = lines[1].trim();
			return name.replace(/\.exe$/i, "") || "unknown";
		}
	} catch {
		// wmic is deprecated, try PowerShell as fallback
		try {
			const output = execSync(
				`powershell -Command "(Get-Process -Id ${pid}).ProcessName"`,
				{ encoding: "utf-8" },
			);
			return output.trim() || "unknown";
		} catch {}
	}
	return "unknown";
}

/**
 * Get process name for a PID (cross-platform)
 */
export function getProcessName(pid: number): string {
	const platform = os.platform();

	if (platform === "win32") {
		return getProcessNameWindows(pid);
	}

	// macOS/Linux
	try {
		const output = execSync(`ps -p ${pid} -o comm= 2>/dev/null || true`, {
			encoding: "utf-8",
		});
		const name = output.trim();
		// On macOS, comm may be truncated. The full path can be gotten with -o command=
		// but comm is usually sufficient for display purposes
		return name || "unknown";
	} catch {
		return "unknown";
	}
}
