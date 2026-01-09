import { EventEmitter } from "node:events";
import type { DetectedPort } from "shared/types";
import { getListeningPortsForPids, getProcessTree } from "./port-scanner";
import type { TerminalSession } from "./types";

// How often to poll for port changes (in ms)
const SCAN_INTERVAL_MS = 2500;

// Delay before scanning after a port hint is detected (in ms)
const HINT_SCAN_DELAY_MS = 500;

// Ports to ignore (common system ports that are usually not dev servers)
const IGNORED_PORTS = new Set([22, 80, 443, 5432, 3306, 6379, 27017]);

/**
 * Check if terminal output contains hints that a port may have been opened.
 * Common patterns from dev servers, test frameworks, etc.
 */
function containsPortHint(data: string): boolean {
	// Common patterns: "listening on port X", "server started on :X", etc.
	const portPatterns = [
		/listening\s+on\s+(?:port\s+)?(\d+)/i,
		/server\s+(?:started|running)\s+(?:on|at)\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
		/ready\s+on\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
		/port\s+(\d+)/i,
		/:(\d{4,5})\s*$/,
	];
	return portPatterns.some((pattern) => pattern.test(data));
}

interface RegisteredSession {
	session: TerminalSession;
	workspaceId: string;
}

/**
 * Daemon session registration for port scanning.
 * Unlike RegisteredSession, this tracks sessions in the daemon process
 * where we only have the PID (not a TerminalSession object).
 */
interface DaemonSession {
	workspaceId: string;
	/** PTY process ID - null if not yet spawned or exited */
	pid: number | null;
}

class PortManager extends EventEmitter {
	private ports = new Map<string, DetectedPort>();
	private sessions = new Map<string, RegisteredSession>();
	/** Daemon-mode sessions: paneId → { workspaceId, pid } */
	private daemonSessions = new Map<string, DaemonSession>();
	private scanInterval: ReturnType<typeof setInterval> | null = null;
	private pendingHintScans = new Map<string, ReturnType<typeof setTimeout>>();
	private isScanning = false;

	constructor() {
		super();
		this.startPeriodicScan();
	}

	/**
	 * Register a terminal session for port scanning
	 */
	registerSession(session: TerminalSession, workspaceId: string): void {
		this.sessions.set(session.paneId, { session, workspaceId });
	}

	/**
	 * Unregister a terminal session and remove its ports
	 */
	unregisterSession(paneId: string): void {
		this.sessions.delete(paneId);
		this.removePortsForPane(paneId);

		// Cancel any pending hint scan for this pane
		const pendingTimeout = this.pendingHintScans.get(paneId);
		if (pendingTimeout) {
			clearTimeout(pendingTimeout);
			this.pendingHintScans.delete(paneId);
		}
	}

	/**
	 * Register or update a daemon-mode terminal session for port scanning.
	 * Use this when the terminal runs in the daemon process (terminal persistence mode).
	 * Can be called multiple times to update the PID when it becomes available or changes.
	 */
	upsertDaemonSession(
		paneId: string,
		workspaceId: string,
		pid: number | null,
	): void {
		this.daemonSessions.set(paneId, { workspaceId, pid });
	}

	/**
	 * Unregister a daemon-mode terminal session and remove its ports
	 */
	unregisterDaemonSession(paneId: string): void {
		this.daemonSessions.delete(paneId);
		this.removePortsForPane(paneId);

		// Cancel any pending hint scan for this pane
		const pendingTimeout = this.pendingHintScans.get(paneId);
		if (pendingTimeout) {
			clearTimeout(pendingTimeout);
			this.pendingHintScans.delete(paneId);
		}
	}

	/**
	 * Check terminal output for hints that a port may have been opened.
	 * If a hint is detected, schedule an immediate scan for that pane.
	 */
	checkOutputForHint(data: string, paneId: string): void {
		if (!containsPortHint(data)) return;

		const existing = this.pendingHintScans.get(paneId);
		if (existing) {
			clearTimeout(existing);
		}

		const timeout = setTimeout(() => {
			this.pendingHintScans.delete(paneId);
			this.scanPane(paneId).catch(() => {});
		}, HINT_SCAN_DELAY_MS);

		this.pendingHintScans.set(paneId, timeout);
	}

	/**
	 * Start periodic scanning of all registered sessions
	 */
	private startPeriodicScan(): void {
		if (this.scanInterval) return;

		this.scanInterval = setInterval(() => {
			this.scanAllSessions().catch((error) => {
				console.error("[PortManager] Scan error:", error);
			});
		}, SCAN_INTERVAL_MS);

		// Don't prevent Node from exiting
		this.scanInterval.unref();
	}

	/**
	 * Stop periodic scanning
	 */
	stopPeriodicScan(): void {
		if (this.scanInterval) {
			clearInterval(this.scanInterval);
			this.scanInterval = null;
		}

		for (const timeout of this.pendingHintScans.values()) {
			clearTimeout(timeout);
		}
		this.pendingHintScans.clear();
	}

	/**
	 * Scan a specific pane for ports.
	 * Works for both regular sessions (with TerminalSession) and daemon sessions (with PID only).
	 */
	private async scanPane(paneId: string): Promise<void> {
		// Check regular sessions first
		const registered = this.sessions.get(paneId);
		if (registered) {
			const { session, workspaceId } = registered;
			if (!session.isAlive) return;

			try {
				const pid = session.pty.pid;
				const pids = await getProcessTree(pid);
				if (pids.length === 0) {
					// Self-healing: process tree is gone, clear ports
					this.removePortsForPane(paneId);
					return;
				}

				const portInfos = await getListeningPortsForPids(pids);
				this.updatePortsForPane(paneId, workspaceId, portInfos);
			} catch (error) {
				console.error(`[PortManager] Error scanning pane ${paneId}:`, error);
			}
			return;
		}

		// Check daemon sessions
		const daemonSession = this.daemonSessions.get(paneId);
		if (daemonSession) {
			const { workspaceId, pid } = daemonSession;
			// Skip if PID not yet available (PTY not spawned)
			if (pid === null) return;

			try {
				const pids = await getProcessTree(pid);
				if (pids.length === 0) {
					// Self-healing: process tree is gone, clear ports
					this.removePortsForPane(paneId);
					return;
				}

				const portInfos = await getListeningPortsForPids(pids);
				this.updatePortsForPane(paneId, workspaceId, portInfos);
			} catch (error) {
				console.error(
					`[PortManager] Error scanning daemon pane ${paneId}:`,
					error,
				);
			}
		}
	}

	/**
	 * Scan all registered sessions for ports.
	 * Includes both regular sessions and daemon sessions.
	 */
	private async scanAllSessions(): Promise<void> {
		if (this.isScanning) return;
		this.isScanning = true;

		try {
			const panePortMap = new Map<
				string,
				{ workspaceId: string; pids: number[] }
			>();
			// Track panes with empty process trees for self-healing
			const emptyTreePanes = new Set<string>();

			// Scan regular sessions
			for (const [paneId, { session, workspaceId }] of this.sessions) {
				if (!session.isAlive) continue;

				try {
					const pid = session.pty.pid;
					const pids = await getProcessTree(pid);
					if (pids.length > 0) {
						panePortMap.set(paneId, { workspaceId, pids });
					} else {
						// Process tree is gone - mark for self-healing
						emptyTreePanes.add(paneId);
					}
				} catch {
					// Session may have exited
				}
			}

			// Scan daemon sessions
			for (const [paneId, { workspaceId, pid }] of this.daemonSessions) {
				// Skip if PID not yet available
				if (pid === null) continue;

				try {
					const pids = await getProcessTree(pid);
					if (pids.length > 0) {
						panePortMap.set(paneId, { workspaceId, pids });
					} else {
						// Process tree is gone - mark for self-healing
						emptyTreePanes.add(paneId);
					}
				} catch {
					// Session may have exited
				}
			}

			// Update ports for panes with active processes
			for (const [paneId, { workspaceId, pids }] of panePortMap) {
				const portInfos = await getListeningPortsForPids(pids);
				this.updatePortsForPane(paneId, workspaceId, portInfos);
			}

			// Self-healing: clear ports for panes with empty process trees
			for (const paneId of emptyTreePanes) {
				this.removePortsForPane(paneId);
			}

			// Cleanup: remove ports for panes that are no longer registered
			// (not in sessions AND not in daemonSessions)
			for (const [key, port] of this.ports) {
				const isRegistered =
					this.sessions.has(port.paneId) ||
					this.daemonSessions.has(port.paneId);
				if (!isRegistered) {
					this.ports.delete(key);
					this.emit("port:remove", port);
				}
			}
		} finally {
			this.isScanning = false;
		}
	}

	/**
	 * Update ports for a specific pane, emitting add/remove events as needed
	 */
	private updatePortsForPane(
		paneId: string,
		workspaceId: string,
		portInfos: Array<{
			port: number;
			pid: number;
			address: string;
			processName: string;
		}>,
	): void {
		const now = Date.now();

		const validPortInfos = portInfos.filter(
			(info) => !IGNORED_PORTS.has(info.port),
		);

		const seenKeys = new Set<string>();

		for (const info of validPortInfos) {
			const key = this.makeKey(paneId, info.port);
			seenKeys.add(key);

			const existing = this.ports.get(key);
			if (!existing) {
				const detectedPort: DetectedPort = {
					port: info.port,
					pid: info.pid,
					processName: info.processName,
					paneId,
					workspaceId,
					detectedAt: now,
					address: info.address,
				};
				this.ports.set(key, detectedPort);
				this.emit("port:add", detectedPort);
			} else if (
				existing.pid !== info.pid ||
				existing.processName !== info.processName
			) {
				const updatedPort: DetectedPort = {
					...existing,
					pid: info.pid,
					processName: info.processName,
					address: info.address,
				};
				this.ports.set(key, updatedPort);
				this.emit("port:remove", existing);
				this.emit("port:add", updatedPort);
			}
		}

		for (const [key, port] of this.ports) {
			if (port.paneId === paneId && !seenKeys.has(key)) {
				this.ports.delete(key);
				this.emit("port:remove", port);
			}
		}
	}

	private makeKey(paneId: string, port: number): string {
		return `${paneId}:${port}`;
	}

	/**
	 * Remove all ports for a specific pane
	 */
	removePortsForPane(paneId: string): void {
		const portsToRemove: DetectedPort[] = [];

		for (const [key, port] of this.ports) {
			if (port.paneId === paneId) {
				portsToRemove.push(port);
				this.ports.delete(key);
			}
		}

		for (const port of portsToRemove) {
			this.emit("port:remove", port);
		}
	}

	/**
	 * Get all detected ports
	 */
	getAllPorts(): DetectedPort[] {
		return Array.from(this.ports.values()).sort(
			(a, b) => b.detectedAt - a.detectedAt,
		);
	}

	/**
	 * Get ports for a specific workspace
	 */
	getPortsByWorkspace(workspaceId: string): DetectedPort[] {
		return this.getAllPorts().filter((p) => p.workspaceId === workspaceId);
	}

	/**
	 * Force an immediate scan of all sessions
	 * Useful for testing or when you know ports have changed
	 */
	async forceScan(): Promise<void> {
		await this.scanAllSessions();
	}
}

export const portManager = new PortManager();
