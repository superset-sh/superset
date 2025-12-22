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

interface ListeningPort {
	port: number;
	pid: number;
}

interface TrackedTerminal {
	paneId: string;
	workspaceId: string;
	shellPid: number;
}

/**
 * Get all listening TCP ports and their PIDs using lsof
 */
async function getListeningPorts(): Promise<ListeningPort[]> {
	try {
		// lsof -i -P -n -sTCP:LISTEN outputs listening TCP sockets
		// -i: network files, -P: don't resolve ports, -n: don't resolve hosts, -sTCP:LISTEN: only listening
		const { stdout } = await execAsync(
			"lsof -i -P -n -sTCP:LISTEN 2>/dev/null",
			{ timeout: 5000 },
		);

		const ports: ListeningPort[] = [];
		const lines = stdout.split("\n").slice(1); // Skip header line

		for (const line of lines) {
			if (!line.trim()) continue;

			// lsof output format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
			// NAME is like: *:3000 or 127.0.0.1:3000 or [::1]:3000
			const parts = line.split(/\s+/);
			if (parts.length < 9) continue;

			const pid = Number.parseInt(parts[1], 10);
			const name = parts[parts.length - 1]; // Last column is NAME

			// Extract port from NAME (e.g., "*:3000", "127.0.0.1:3000", "[::1]:3000")
			const portMatch = name.match(/:(\d+)$/);
			if (!portMatch) continue;

			const port = Number.parseInt(portMatch[1], 10);

			if (
				!Number.isNaN(pid) &&
				!Number.isNaN(port) &&
				port >= MIN_PORT &&
				port <= MAX_PORT &&
				!IGNORED_PORTS.has(port)
			) {
				// Avoid duplicates (same port can appear multiple times for IPv4/IPv6)
				if (!ports.some((p) => p.port === port)) {
					ports.push({ port, pid });
				}
			}
		}

		return ports;
	} catch {
		// lsof might fail on some systems or if no ports are listening
		return [];
	}
}

/**
 * Get all process parent-child relationships in a single call.
 * Returns a Map from PID to parent PID.
 */
async function getAllProcessParents(): Promise<Map<number, number>> {
	const parentMap = new Map<number, number>();

	try {
		// Get all processes with their parent PIDs in one call
		// ps -A -o pid=,ppid= outputs: "  PID  PPID" for all processes
		const { stdout } = await execAsync("ps -A -o pid=,ppid=", {
			timeout: 5000,
		});

		for (const line of stdout.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const parts = trimmed.split(/\s+/);
			if (parts.length < 2) continue;

			const pid = Number.parseInt(parts[0], 10);
			const ppid = Number.parseInt(parts[1], 10);

			if (!Number.isNaN(pid) && !Number.isNaN(ppid)) {
				parentMap.set(pid, ppid);
			}
		}
	} catch {
		// ps might fail
	}

	return parentMap;
}

/**
 * Check if a process is a descendant of a given ancestor PID.
 * Uses a pre-computed parent map for efficiency.
 */
function isDescendantOf(
	pid: number,
	ancestorPid: number,
	parentMap: Map<number, number>,
): boolean {
	let currentPid = pid;
	let iterations = 0;
	const maxIterations = 100; // Prevent infinite loops

	while (currentPid > 1 && iterations < maxIterations) {
		if (currentPid === ancestorPid) {
			return true;
		}

		const ppid = parentMap.get(currentPid);
		if (ppid === undefined || ppid === currentPid) break;

		currentPid = ppid;
		iterations++;
	}

	return false;
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
	 * Scan for listening ports and match them to terminal sessions
	 */
	private async scanForPorts(): Promise<void> {
		// Prevent concurrent scans
		if (this.isScanning) return;
		this.isScanning = true;

		try {
			// Get all data needed for the scan in parallel
			const [listeningPorts, parentMap] = await Promise.all([
				getListeningPorts(),
				getAllProcessParents(),
			]);

			// Track which ports we found in this scan (for cleanup)
			const foundPorts = new Set<string>();

			// For each listening port, check if it belongs to any of our terminals
			for (const { port, pid } of listeningPorts) {
				// Check each registered terminal
				for (const terminal of this.terminals.values()) {
					if (isDescendantOf(pid, terminal.shellPid, parentMap)) {
						const key = this.makeKey(terminal.paneId, port);
						foundPorts.add(key);

						// Add port if not already tracked
						if (!this.ports.has(key)) {
							this.addPort(port, terminal.paneId, terminal.workspaceId, pid);
						}
						// Port belongs to this terminal, no need to check others
						break;
					}
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
		pid: number,
	): void {
		const key = this.makeKey(paneId, port);

		const detectedPort: DetectedPort = {
			port,
			paneId,
			workspaceId,
			detectedAt: Date.now(),
			contextLine: `Process ${pid} listening on port ${port}`,
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
