import { EventEmitter } from "node:events";
import type { DetectedPort } from "shared/types";
import { treeKillWithEscalation } from "../tree-kill";
import {
	getListeningPortsForPids,
	getProcessTree,
	type PortInfo,
} from "./port-scanner";
import type { TerminalSession } from "./types";

// How often to poll for port changes (in ms)
const SCAN_INTERVAL_MS = 2500;

// Delay before scanning after a port hint is detected (in ms)
const HINT_SCAN_DELAY_MS = 500;

// Ports to ignore (common system ports that are usually not dev servers)
const IGNORED_PORTS = new Set([22, 80, 443, 5432, 3306, 6379, 27017]);

/**
 * Check if terminal output contains hints that a port may have been opened.
 * Restricted to phrases that strongly imply a server just started listening;
 * looser patterns like a bare "port 22" or trailing ":12345" are omitted
 * because they match routine log output (ssh banners, timestamps, etc.) and
 * triggered excessive lsof scans — see issue #3372.
 */
function containsPortHint(data: string): boolean {
	const portPatterns = [
		/listening\s+on\s+(?:port\s+)?(\d+)/i,
		/server\s+(?:started|running)\s+(?:on|at)\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
		/ready\s+on\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
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

interface ScanState {
	panePortMap: Map<string, { workspaceId: string; pids: number[] }>;
	pidOwnerMap: Map<number, { paneId: string; workspaceId: string }>;
	allPids: Set<number>;
	emptyTreePanes: Set<string>;
}

class PortManager extends EventEmitter {
	private ports = new Map<string, DetectedPort>();
	private sessions = new Map<string, RegisteredSession>();
	/** Daemon-mode sessions: paneId → { workspaceId, pid } */
	private daemonSessions = new Map<string, DaemonSession>();
	private scanInterval: ReturnType<typeof setInterval> | null = null;
	private hintScanTimeout: ReturnType<typeof setTimeout> | null = null;
	private isScanning = false;
	/** Set when a hint arrives during a scan; triggers one follow-up scan. */
	private scanRequested = false;
	/** Aborts any in-flight scan children (lsof/netstat) on teardown. */
	private scanAbort: AbortController | null = null;

	/**
	 * Register a terminal session for port scanning
	 */
	registerSession(session: TerminalSession, workspaceId: string): void {
		this.sessions.set(session.paneId, { session, workspaceId });
		this.ensurePeriodicScanRunning();
	}

	/**
	 * Unregister a terminal session and remove its ports
	 */
	unregisterSession(paneId: string): void {
		this.sessions.delete(paneId);
		this.removePortsForPane(paneId);
		this.stopPeriodicScanIfIdle();
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
		this.ensurePeriodicScanRunning();
	}

	/**
	 * Unregister a daemon-mode terminal session and remove its ports
	 */
	unregisterDaemonSession(paneId: string): void {
		this.daemonSessions.delete(paneId);
		this.removePortsForPane(paneId);
		this.stopPeriodicScanIfIdle();
	}

	checkOutputForHint(data: string): void {
		if (!containsPortHint(data)) return;
		this.scheduleHintScan();
	}

	private hasAnySessions(): boolean {
		return this.sessions.size > 0 || this.daemonSessions.size > 0;
	}

	private ensurePeriodicScanRunning(): void {
		if (this.scanInterval) return;

		this.scanAbort = new AbortController();
		this.scanInterval = setInterval(() => {
			this.scanAllSessions().catch((error) => {
				console.error("[PortManager] Scan error:", error);
			});
		}, SCAN_INTERVAL_MS);

		// Don't prevent Node from exiting
		this.scanInterval.unref();
	}

	private stopPeriodicScanIfIdle(): void {
		if (!this.hasAnySessions()) this.stopPeriodicScan();
	}

	stopPeriodicScan(): void {
		if (this.scanInterval) {
			clearInterval(this.scanInterval);
			this.scanInterval = null;
		}

		if (this.hintScanTimeout) {
			clearTimeout(this.hintScanTimeout);
			this.hintScanTimeout = null;
		}

		// Kill any in-flight lsof/netstat so it can't outlive us.
		if (this.scanAbort) {
			this.scanAbort.abort();
			this.scanAbort = null;
		}

		this.scanRequested = false;
	}

	/**
	 * Debounce hint-triggered scans into a single follow-up bulk scan.
	 * Hints arrive on every PTY data chunk; we only need one scan per burst.
	 */
	private scheduleHintScan(): void {
		if (this.hintScanTimeout) return;

		this.hintScanTimeout = setTimeout(() => {
			this.hintScanTimeout = null;
			this.scanAllSessions().catch(() => {});
		}, HINT_SCAN_DELAY_MS);
		this.hintScanTimeout.unref();
	}

	private createScanState(): ScanState {
		return {
			panePortMap: new Map<string, { workspaceId: string; pids: number[] }>(),
			pidOwnerMap: new Map<number, { paneId: string; workspaceId: string }>(),
			allPids: new Set<number>(),
			emptyTreePanes: new Set<string>(),
		};
	}

	private async collectRegularSessionPids(scanState: ScanState): Promise<void> {
		const tasks: Promise<void>[] = [];
		for (const [paneId, { session, workspaceId }] of this.sessions) {
			if (!session.isAlive) continue;
			tasks.push(
				this.collectPidTree({
					paneId,
					workspaceId,
					pid: session.pty.pid,
					scanState,
				}),
			);
		}
		await Promise.all(tasks);
	}

	private async collectDaemonSessionPids(scanState: ScanState): Promise<void> {
		const tasks: Promise<void>[] = [];
		for (const [paneId, { workspaceId, pid }] of this.daemonSessions) {
			if (pid === null) continue;
			tasks.push(
				this.collectPidTree({
					paneId,
					workspaceId,
					pid,
					scanState,
				}),
			);
		}
		await Promise.all(tasks);
	}

	private async collectPidTree({
		paneId,
		workspaceId,
		pid,
		scanState,
	}: {
		paneId: string;
		workspaceId: string;
		pid: number;
		scanState: ScanState;
	}): Promise<void> {
		try {
			const pids = await getProcessTree(pid);
			if (pids.length === 0) {
				scanState.emptyTreePanes.add(paneId);
				return;
			}

			scanState.panePortMap.set(paneId, { workspaceId, pids });
			this.addPanePids({ paneId, workspaceId, pids, scanState });
		} catch {
			// Session may have exited
		}
	}

	private addPanePids({
		paneId,
		workspaceId,
		pids,
		scanState,
	}: {
		paneId: string;
		workspaceId: string;
		pids: number[];
		scanState: ScanState;
	}): void {
		for (const childPid of pids) {
			scanState.allPids.add(childPid);
			if (!scanState.pidOwnerMap.has(childPid)) {
				scanState.pidOwnerMap.set(childPid, { paneId, workspaceId });
			}
		}
	}

	private async buildPortsByPane({
		allPids,
		pidOwnerMap,
	}: {
		allPids: Set<number>;
		pidOwnerMap: ScanState["pidOwnerMap"];
	}): Promise<Map<string, PortInfo[]>> {
		const portsByPane = new Map<string, PortInfo[]>();
		const allPidList = Array.from(allPids);
		if (allPidList.length === 0) return portsByPane;

		const portInfos = await getListeningPortsForPids(
			allPidList,
			this.scanAbort?.signal,
		);
		for (const info of portInfos) {
			const owner = pidOwnerMap.get(info.pid);
			if (!owner) continue;
			const existing = portsByPane.get(owner.paneId);
			if (existing) {
				existing.push(info);
			} else {
				portsByPane.set(owner.paneId, [info]);
			}
		}

		return portsByPane;
	}

	private updatePortsFromScan({
		panePortMap,
		portsByPane,
	}: {
		panePortMap: ScanState["panePortMap"];
		portsByPane: Map<string, PortInfo[]>;
	}): void {
		for (const [paneId, { workspaceId }] of panePortMap) {
			const portInfos = portsByPane.get(paneId) ?? [];
			this.updatePortsForPane({ paneId, workspaceId, portInfos });
		}
	}

	private clearEmptyTreePanes(emptyTreePanes: Set<string>): void {
		for (const paneId of emptyTreePanes) {
			this.removePortsForPane(paneId);
		}
	}

	private cleanupUnregisteredPorts(): void {
		for (const [key, port] of this.ports) {
			const isRegistered =
				this.sessions.has(port.paneId) || this.daemonSessions.has(port.paneId);
			if (!isRegistered) {
				this.ports.delete(key);
				this.emit("port:remove", port);
			}
		}
	}

	private async scanAllSessions(): Promise<void> {
		if (this.isScanning) {
			// A hint or tick fired mid-scan; queue exactly one follow-up.
			this.scanRequested = true;
			return;
		}
		if (!this.hasAnySessions()) return;
		this.isScanning = true;

		try {
			const scanState = this.createScanState();
			await this.collectRegularSessionPids(scanState);
			await this.collectDaemonSessionPids(scanState);

			const portsByPane = await this.buildPortsByPane({
				allPids: scanState.allPids,
				pidOwnerMap: scanState.pidOwnerMap,
			});

			this.updatePortsFromScan({
				panePortMap: scanState.panePortMap,
				portsByPane,
			});
			this.clearEmptyTreePanes(scanState.emptyTreePanes);
			this.cleanupUnregisteredPorts();
		} finally {
			this.isScanning = false;
		}

		if (this.scanRequested && this.hasAnySessions()) {
			this.scanRequested = false;
			await this.scanAllSessions();
		}
	}

	private updatePortsForPane({
		paneId,
		workspaceId,
		portInfos,
	}: {
		paneId: string;
		workspaceId: string;
		portInfos: PortInfo[];
	}): void {
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

	getAllPorts(): DetectedPort[] {
		return Array.from(this.ports.values()).sort(
			(a, b) => b.detectedAt - a.detectedAt,
		);
	}

	getPortsByWorkspace(workspaceId: string): DetectedPort[] {
		return this.getAllPorts().filter((p) => p.workspaceId === workspaceId);
	}

	async forceScan(): Promise<void> {
		await this.scanAllSessions();
	}

	/**
	 * Kill a process tree listening on a tracked port.
	 * Refuses to kill the terminal's shell process itself.
	 */
	killPort({ paneId, port }: { paneId: string; port: number }): Promise<{
		success: boolean;
		error?: string;
	}> {
		const key = this.makeKey(paneId, port);
		const detectedPort = this.ports.get(key);

		if (!detectedPort) {
			return Promise.resolve({
				success: false,
				error: "Port not found in tracked ports",
			});
		}

		const session = this.sessions.get(paneId);
		const daemonSession = this.daemonSessions.get(paneId);
		const shellPid = session?.session.pty.pid ?? daemonSession?.pid;

		if (shellPid != null && detectedPort.pid === shellPid) {
			return Promise.resolve({
				success: false,
				error: "Cannot kill the terminal shell process",
			});
		}

		return treeKillWithEscalation({ pid: detectedPort.pid });
	}
}

export const portManager = new PortManager();
