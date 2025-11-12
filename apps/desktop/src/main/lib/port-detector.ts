import { exec } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import type { IPty } from "node-pty";

const execAsync = promisify(exec);

interface DetectedPort {
	port: number;
	service?: string;
	terminalId: string;
	detectedAt: string;
}

export interface PortDetectedEvent extends DetectedPort {
	worktreeId: string;
}

export interface PortClosedEvent {
	terminalId: string;
	worktreeId: string;
	port: number;
}

interface MonitoredTerminal {
	terminalId: string;
	worktreeId: string;
	ptyProcess: IPty;
	cwd?: string;
	intervalId?: NodeJS.Timeout;
	lastDetectedPorts: Set<number>;
}

export class PortDetector extends EventEmitter {
	private static instance: PortDetector;
	private monitoredTerminals: Map<string, MonitoredTerminal> = new Map();
	private worktreePortsCache: Map<string, DetectedPort[]> = new Map();
	private readonly POLL_INTERVAL = 2000; // 2 seconds

	private constructor() {
		super();
	}

	static getInstance(): PortDetector {
		if (!PortDetector.instance) {
			PortDetector.instance = new PortDetector();
		}
		return PortDetector.instance;
	}

	/**
	 * Start monitoring a terminal for port detection
	 */
	startMonitoring(
		terminalId: string,
		worktreeId: string,
		ptyProcess: IPty,
		cwd?: string,
	): void {
		// Stop existing monitoring if any
		this.stopMonitoring(terminalId);

		const monitored: MonitoredTerminal = {
			terminalId,
			worktreeId,
			ptyProcess,
			cwd,
			lastDetectedPorts: new Set(),
		};

		this.monitoredTerminals.set(terminalId, monitored);

		// Start polling
		monitored.intervalId = setInterval(() => {
			this.pollTerminalPorts(terminalId).catch((error) => {
				console.error(`Error polling ports for terminal ${terminalId}:`, error);
			});
		}, this.POLL_INTERVAL);

		// Also do an immediate check
		this.pollTerminalPorts(terminalId).catch((error) => {
			console.error(`Error in initial port check for ${terminalId}:`, error);
		});
	}

	/**
	 * Stop monitoring a terminal
	 */
	stopMonitoring(terminalId: string): void {
		const monitored = this.monitoredTerminals.get(terminalId);
		if (!monitored) return;

		if (monitored.intervalId) {
			clearInterval(monitored.intervalId);
		}

		// Emit port-closed events for all ports that were detected
		for (const port of monitored.lastDetectedPorts) {
			this.emit("port-closed", {
				terminalId,
				worktreeId: monitored.worktreeId,
				port,
			});
		}

		this.monitoredTerminals.delete(terminalId);

		// Update cache
		this.updateWorktreePortsCache(monitored.worktreeId);
	}

	/**
	 * Poll a terminal for listening ports
	 */
	private async pollTerminalPorts(terminalId: string): Promise<void> {
		const monitored = this.monitoredTerminals.get(terminalId);
		if (!monitored) return;

		const pid = monitored.ptyProcess.pid;
		const ports = await this.getPortsForPID(pid);

		// Compare with last detected ports
		const currentPorts = new Set(ports);
		const previousPorts = monitored.lastDetectedPorts;

		// Find newly detected ports
		const newPorts = ports.filter((port) => !previousPorts.has(port));

		// Find closed ports
		const closedPorts = Array.from(previousPorts).filter(
			(port) => !currentPorts.has(port),
		);

		// Update last detected ports FIRST before emitting events
		monitored.lastDetectedPorts = currentPorts;

		// Update cache BEFORE emitting events so handlers can read updated cache
		this.updateWorktreePortsCache(monitored.worktreeId);

		// Emit events for new ports
		for (const port of newPorts) {
			const service = this.detectServiceName(monitored.cwd);
			const detectedPort: DetectedPort = {
				port,
				service,
				terminalId,
				detectedAt: new Date().toISOString(),
			};

			this.emit("port-detected", {
				...detectedPort,
				worktreeId: monitored.worktreeId,
			});
		}

		// Emit events for closed ports
		for (const port of closedPorts) {
			this.emit("port-closed", {
				terminalId,
				worktreeId: monitored.worktreeId,
				port,
			});
		}
	}

	/**
	 * Get all listening ports for a PID (including child processes)
	 */
	private async getPortsForPID(pid: number): Promise<number[]> {
		try {
			// Get all descendant PIDs recursively (using pstree-like approach)
			const allPids = await this.getAllDescendantPIDs(pid);

			const allPorts: number[] = [];

			// Check each PID for listening ports
			for (const checkPid of allPids) {
				if (Number.isNaN(checkPid)) continue;

				try {
					const { stdout } = await execAsync(
						`lsof -Pan -p ${checkPid} -i4TCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | sed 's/.*://' || true`,
					);

					const ports = stdout
						.trim()
						.split("\n")
						.filter(Boolean)
						.map((p) => Number.parseInt(p, 10))
						.filter((p) => !Number.isNaN(p) && p > 0 && p <= 65535);

					allPorts.push(...ports);
				} catch (error) {}
			}

			return [...new Set(allPorts)]; // Deduplicate
		} catch (error) {
			// lsof may fail if process has no listening ports, which is expected
			return [];
		}
	}

	/**
	 * Recursively get all descendant PIDs (children, grandchildren, etc.)
	 */
	private async getAllDescendantPIDs(pid: number): Promise<number[]> {
		const allPids = [pid];
		const toProcess = [pid];

		while (toProcess.length > 0) {
			const currentPid = toProcess.shift();
			if (currentPid === undefined) break;

			try {
				const { stdout: childPids } = await execAsync(
					`pgrep -P ${currentPid} || true`,
				);

				const children = childPids
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
			} catch (error) {}
		}

		return allPids;
	}

	/**
	 * Detect service name from terminal working directory
	 */
	private detectServiceName(cwd?: string): string | undefined {
		if (!cwd) {
			return undefined;
		}

		// Extract service name from path
		// Example: ~/.superset/worktrees/website/main/apps/docs -> "docs"
		// Example: ~/.superset/worktrees/website/test -> "website"
		// Example: /path/to/repo/apps/docs -> "docs"

		const parts = cwd.split("/");

		// Check for common monorepo patterns
		const appsIndex = parts.lastIndexOf("apps");
		if (appsIndex !== -1 && appsIndex < parts.length - 1) {
			const serviceName = parts[appsIndex + 1];
			return serviceName;
		}

		const packagesIndex = parts.lastIndexOf("packages");
		if (packagesIndex !== -1 && packagesIndex < parts.length - 1) {
			const serviceName = parts[packagesIndex + 1];
			return serviceName;
		}

		// Check if this is a worktree path: ~/.superset/worktrees/{repo}/{branch}
		const worktreesIndex = parts.lastIndexOf("worktrees");
		if (worktreesIndex !== -1 && worktreesIndex < parts.length - 2) {
			// Use repo name (one level after 'worktrees'), not branch name
			const serviceName = parts[worktreesIndex + 1];
			return serviceName;
		}

		// Fallback: use the last directory name
		const serviceName = parts[parts.length - 1];
		return serviceName;
	}

	/**
	 * Update the cache of detected ports for a worktree
	 */
	private updateWorktreePortsCache(worktreeId: string): void {
		const ports: DetectedPort[] = [];

		for (const monitored of this.monitoredTerminals.values()) {
			if (monitored.worktreeId === worktreeId) {
				const service = this.detectServiceName(monitored.cwd);

				for (const port of monitored.lastDetectedPorts) {
					ports.push({
						port,
						service,
						terminalId: monitored.terminalId,
						detectedAt: new Date().toISOString(),
					});
				}
			}
		}

		this.worktreePortsCache.set(worktreeId, ports);
	}

	/**
	 * Get all detected ports for a worktree
	 */
	getDetectedPorts(worktreeId: string): DetectedPort[] {
		return this.worktreePortsCache.get(worktreeId) || [];
	}

	/**
	 * Get detected ports as a map of service name to port
	 * For ports without a service name, the port number itself is used as the key
	 */
	getDetectedPortsMap(worktreeId: string): Record<string, number> {
		const ports = this.getDetectedPorts(worktreeId);

		const map: Record<string, number> = {};

		for (const detected of ports) {
			if (detected.service) {
				// Named service: use service name as key
				if (!map[detected.service]) {
					map[detected.service] = detected.port;
				}
			} else {
				// No service name: use port number as key (e.g., "3000" → 3000)
				const portKey = detected.port.toString();
				if (!map[portKey]) {
					map[portKey] = detected.port;
				}
			}
		}

		return map;
	}

	/**
	 * Get all monitored terminals
	 */
	getMonitoredTerminals(): string[] {
		return Array.from(this.monitoredTerminals.keys());
	}

	/**
	 * Cleanup all monitoring
	 */
	cleanup(): void {
		for (const terminalId of this.monitoredTerminals.keys()) {
			this.stopMonitoring(terminalId);
		}
		this.worktreePortsCache.clear();
	}
}

export const portDetector = PortDetector.getInstance();
