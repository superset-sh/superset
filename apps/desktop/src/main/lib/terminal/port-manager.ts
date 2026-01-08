import { EventEmitter } from "node:events";
import type { DetectedPort } from "shared/types";
import { getListeningPortsForPids, getProcessTree } from "./port-scanner";
import type { TerminalSession } from "./types";

// How often to poll for port changes (in ms)
const SCAN_INTERVAL_MS = 2500;

// Ports to ignore (common system ports that are usually not dev servers)
const IGNORED_PORTS = new Set([22, 80, 443, 5432, 3306, 6379, 27017]);

interface RegisteredSession {
	session: TerminalSession;
	workspaceId: string;
}

class PortManager extends EventEmitter {
	private ports = new Map<string, DetectedPort>();
	private sessions = new Map<string, RegisteredSession>();
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
	 * Scan all registered sessions for ports
	 */
	private async scanAllSessions(): Promise<void> {
		if (this.isScanning) return;
		this.isScanning = true;

		try {
			const panePortMap = new Map<
				string,
				{ workspaceId: string; pids: number[] }
			>();

			for (const [paneId, { session, workspaceId }] of this.sessions) {
				if (!session.isAlive) continue;

				try {
					const pid = session.pty.pid;
					const pids = await getProcessTree(pid);
					if (pids.length > 0) {
						panePortMap.set(paneId, { workspaceId, pids });
					}
				} catch {
					// Session may have exited
				}
			}

			for (const [paneId, { workspaceId, pids }] of panePortMap) {
				const portInfos = await getListeningPortsForPids(pids);
				this.updatePortsForPane(paneId, workspaceId, portInfos);
			}

			for (const [key, port] of this.ports) {
				if (!this.sessions.has(port.paneId)) {
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
