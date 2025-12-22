import { exec } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import type { DetectedPort } from "shared/types";

const execAsync = promisify(exec);

// How often to scan for listening ports (in ms)
const PORT_SCAN_INTERVAL = 3000;

// Ports to ignore (common system/ephemeral ports)
const IGNORED_PORTS = new Set([80, 443]);

// Minimum valid port to track
const MIN_PORT = 1024;

// Maximum valid port
const MAX_PORT = 65535;

interface TrackedTerminal {
	paneId: string;
	workspaceId: string;
	shellPid: number;
}

/**
 * Recursively get all descendant PIDs (children, grandchildren, etc.) of a process.
 * Uses pgrep to walk down the process tree from a given PID.
 */
async function getAllDescendantPIDs(pid: number): Promise<number[]> {
	const allPids = [pid];
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
				if (!allPids.includes(childPid)) {
					allPids.push(childPid);
					toProcess.push(childPid);
				}
			}
		} catch {}
	}

	return allPids;
}

/**
 * Get listening ports for a set of PIDs.
 * Returns an array of port numbers.
 */
async function getListeningPortsForPIDs(pids: number[]): Promise<number[]> {
	if (pids.length === 0) return [];

	const allPorts: number[] = [];

	// Check each PID for listening ports using lsof
	for (const pid of pids) {
		try {
			// lsof for a specific PID's listening TCP ports
			const { stdout } = await execAsync(
				`lsof -Pan -p ${pid} -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | sed 's/.*://' || true`,
				{ timeout: 2000 },
			);

			const ports = stdout
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((p) => Number.parseInt(p, 10))
				.filter(
					(p) =>
						!Number.isNaN(p) &&
						p >= MIN_PORT &&
						p <= MAX_PORT &&
						!IGNORED_PORTS.has(p),
				);

			allPorts.push(...ports);
		} catch {}
	}

	// Deduplicate
	return [...new Set(allPorts)];
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

	constructor() {
		super();
		this.startPortScanning();
	}

	private makeKey(paneId: string, port: number): string {
		return `${paneId}:${port}`;
	}

	/**
	 * Register a terminal session for port tracking.
	 * Call this when a new terminal session is created.
	 */
	registerTerminal(
		paneId: string,
		workspaceId: string,
		shellPid: number,
	): void {
		this.terminals.set(paneId, { paneId, workspaceId, shellPid });
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
					const ports = await getListeningPortsForPIDs(descendantPids);

					// Track and emit new ports
					for (const port of ports) {
						const key = this.makeKey(terminal.paneId, port);
						foundPorts.add(key);

						// Add port if not already tracked
						if (!this.ports.has(key)) {
							this.addPort(port, terminal.paneId, terminal.workspaceId);
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
	private addPort(port: number, paneId: string, workspaceId: string): void {
		const key = this.makeKey(paneId, port);

		const detectedPort: DetectedPort = {
			port,
			paneId,
			workspaceId,
			detectedAt: Date.now(),
			contextLine: `Listening on port ${port}`,
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

	/**
	 * @deprecated Use registerTerminal/unregisterTerminal instead.
	 * This method is kept for backward compatibility but does nothing.
	 */
	scanOutput(_data: string, _paneId: string, _workspaceId: string): void {
		// No-op: port detection is now process-based, not output-based
	}
}

export const portManager = new PortManager();
