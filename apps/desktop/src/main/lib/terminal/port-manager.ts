import { exec } from "node:child_process";
import { EventEmitter } from "node:events";
import os from "node:os";
import { promisify } from "node:util";
import type { DetectedPort } from "shared/types";

const execAsync = promisify(exec);

// Port detection only works on macOS and Linux (uses pgrep/lsof)
const IS_SUPPORTED_PLATFORM =
	os.platform() === "darwin" || os.platform() === "linux";

// How often to scan for listening ports (in ms)
// 3 seconds balances responsiveness with CPU overhead from process tree scanning
const PORT_SCAN_INTERVAL = 3000;

// Ports to ignore - these are typically system services, not user dev servers
// 80: HTTP, 443: HTTPS - usually handled by system web servers or proxies
const IGNORED_PORTS = new Set([80, 443]);

// Port range to track: 1024-65535 (user/unprivileged ports)
// Ports 0-1023 are "well-known" ports requiring root and are typically system services
const MIN_PORT = 1024;
const MAX_PORT = 65535;

interface TrackedTerminal {
	paneId: string;
	workspaceId: string;
	shellPid: number;
}

/**
 * Recursively get all descendant PIDs (children, grandchildren, etc.) of a process.
 * Uses pgrep to walk down the process tree from a given PID.
 * Only works on macOS/Linux.
 */
async function getAllDescendantPIDs(pid: number): Promise<number[]> {
	if (!IS_SUPPORTED_PLATFORM) return [pid];

	const seenPids = new Set<number>([pid]); // O(1) lookup for deduplication
	const toProcess = [pid];

	while (toProcess.length > 0) {
		const currentPid = toProcess.shift();
		if (currentPid === undefined) break;

		try {
			// pgrep -P gets direct children of a process
			const { stdout } = await execAsync(
				`pgrep -P ${currentPid} 2>/dev/null || true`,
				{
					timeout: 2000,
				},
			);

			const children = stdout
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((p) => Number.parseInt(p, 10))
				.filter((p) => !Number.isNaN(p));

			for (const childPid of children) {
				if (!seenPids.has(childPid)) {
					seenPids.add(childPid);
					toProcess.push(childPid);
				}
			}
		} catch (_error) {
			// pgrep may fail if process exited or on permission issues
			// This is expected for short-lived processes, so we continue silently
		}
	}

	return Array.from(seenPids);
}

interface PortInfo {
	port: number;
	command: string;
}

/**
 * Get listening ports for a set of PIDs, including the command name.
 * Only works on macOS/Linux.
 */
async function getListeningPortsForPIDs(pids: number[]): Promise<PortInfo[]> {
	if (!IS_SUPPORTED_PLATFORM || pids.length === 0) return [];

	const portMap = new Map<number, string>(); // port -> command (deduplicates)

	// Check each PID for listening ports using lsof
	for (const pid of pids) {
		try {
			// lsof for a specific PID's listening TCP ports
			// Output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
			const { stdout } = await execAsync(
				`lsof -Pan -p ${pid} -iTCP -sTCP:LISTEN 2>/dev/null || true`,
				{ timeout: 2000 },
			);

			const lines = stdout.trim().split("\n").slice(1); // Skip header
			for (const line of lines) {
				const parts = line.split(/\s+/);
				if (parts.length < 9) continue;

				const command = parts[0]; // First column is COMMAND
				const name = parts[parts.length - 1]; // Last column is NAME (e.g., *:3000)
				const portMatch = name.match(/:(\d+)$/);
				if (!portMatch) continue;

				const port = Number.parseInt(portMatch[1], 10);
				if (
					!Number.isNaN(port) &&
					port >= MIN_PORT &&
					port <= MAX_PORT &&
					!IGNORED_PORTS.has(port) &&
					!portMap.has(port)
				) {
					portMap.set(port, command);
				}
			}
		} catch (_error) {
			// lsof may fail if process exited during scan - this is expected
		}
	}

	return Array.from(portMap.entries()).map(([port, command]) => ({
		port,
		command,
	}));
}

class PortManager extends EventEmitter {
	// Detected ports: key is "paneId:port"
	private ports = new Map<string, DetectedPort>();
	// Tracked terminals: paneId → terminal info (including shell PID)
	private terminals = new Map<string, TrackedTerminal>();
	// Port scan interval handle
	private scanInterval: ReturnType<typeof setInterval> | null = null;
	// Prevent concurrent scans
	private isScanning = false;

	private makeKey(paneId: string, port: number): string {
		return `${paneId}:${port}`;
	}

	/**
	 * Register a terminal session for port tracking.
	 * Call this when a new terminal session is created.
	 * Starts port scanning lazily on first terminal registration.
	 */
	registerTerminal(
		paneId: string,
		workspaceId: string,
		shellPid: number,
	): void {
		const isFirstTerminal = this.terminals.size === 0;
		this.terminals.set(paneId, { paneId, workspaceId, shellPid });

		// Start scanning lazily when first terminal is registered
		if (isFirstTerminal) {
			this.startPortScanning();
		}
	}

	/**
	 * Unregister a terminal session.
	 * Call this when a terminal session is destroyed.
	 */
	unregisterTerminal(paneId: string): void {
		this.terminals.delete(paneId);
		this.removePortsForPane(paneId);
	}

	/**
	 * Start periodic scanning for listening ports
	 */
	private startPortScanning(): void {
		if (this.scanInterval) return;

		if (!IS_SUPPORTED_PLATFORM) {
			console.warn(
				"[PortManager] Port detection is only supported on macOS and Linux",
			);
			return;
		}

		// Do an initial scan soon after startup
		setTimeout(() => this.scanForPorts(), 1000);

		this.scanInterval = setInterval(() => {
			this.scanForPorts();
		}, PORT_SCAN_INTERVAL);

		// Don't prevent Node from exiting
		this.scanInterval.unref();
	}

	/**
	 * Stop port scanning
	 */
	stopPortScanning(): void {
		if (this.scanInterval) {
			clearInterval(this.scanInterval);
			this.scanInterval = null;
		}
	}

	/**
	 * Scan for listening ports and match them to terminal sessions.
	 * Uses a targeted approach: for each terminal, get all descendant processes
	 * and check which ones are listening on ports.
	 */
	private async scanForPorts(): Promise<void> {
		// Prevent concurrent scans
		if (this.isScanning) return;
		this.isScanning = true;

		try {
			// Track which ports we found in this scan (for cleanup)
			const foundPorts = new Set<string>();

			// For each terminal, find its descendant processes and their listening ports
			for (const terminal of this.terminals.values()) {
				try {
					// Get all descendant PIDs of this terminal's shell
					const descendantPids = await getAllDescendantPIDs(terminal.shellPid);

					// Get listening ports for these PIDs
					const portInfos = await getListeningPortsForPIDs(descendantPids);

					// Track and emit new ports
					for (const { port, command } of portInfos) {
						const key = this.makeKey(terminal.paneId, port);
						foundPorts.add(key);

						// Add port if not already tracked
						if (!this.ports.has(key)) {
							this.addPort(
								port,
								terminal.paneId,
								terminal.workspaceId,
								command,
							);
						}
					}
				} catch (error) {
					console.error(
						`[PortManager] Error scanning terminal ${terminal.paneId}:`,
						error,
					);
				}
			}

			// Remove ports that are no longer listening
			for (const [key, detectedPort] of this.ports.entries()) {
				if (!foundPorts.has(key)) {
					this.ports.delete(key);
					this.emit("port:remove", detectedPort);
				}
			}
		} catch (error) {
			console.error("[PortManager] Error scanning ports:", error);
		} finally {
			this.isScanning = false;
		}
	}

	/**
	 * Add a detected port
	 */
	private addPort(
		port: number,
		paneId: string,
		workspaceId: string,
		command: string,
	): void {
		const key = this.makeKey(paneId, port);

		const detectedPort: DetectedPort = {
			port,
			paneId,
			workspaceId,
			detectedAt: Date.now(),
			contextLine: `${command} listening on port ${port}`,
		};

		this.ports.set(key, detectedPort);
		this.emit("port:add", detectedPort);
	}

	/**
	 * Remove a specific port
	 */
	removePort(paneId: string, port: number): void {
		const key = this.makeKey(paneId, port);
		const detectedPort = this.ports.get(key);

		if (detectedPort) {
			this.ports.delete(key);
			this.emit("port:remove", detectedPort);
		}
	}

	/**
	 * Remove all ports for a specific pane
	 */
	removePortsForPane(paneId: string): void {
		const portsToRemove: DetectedPort[] = [];

		for (const [key, port] of this.ports.entries()) {
			if (port.paneId === paneId) {
				portsToRemove.push(port);
				this.ports.delete(key);
			}
		}

		for (const port of portsToRemove) {
			this.emit("port:remove", port);
		}
	}

	getAllPorts(): DetectedPort[] {
		return Array.from(this.ports.values()).sort(
			(a, b) => b.detectedAt - a.detectedAt,
		);
	}

	getPortsByWorkspace(workspaceId: string): DetectedPort[] {
		return this.getAllPorts().filter((p) => p.workspaceId === workspaceId);
	}

	/**
	 * Force an immediate port scan (useful after starting a server)
	 */
	async triggerScan(): Promise<void> {
		await this.scanForPorts();
	}
}

export const portManager = new PortManager();
