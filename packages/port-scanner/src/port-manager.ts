import { EventEmitter } from "node:events";
import {
	getListeningPortsForPids,
	getProcessTree,
	type PortInfo,
} from "./scanner";
import type { DetectedPort } from "./types";

/** How often to poll for port changes (in ms) */
const SCAN_INTERVAL_MS = 2500;

/** Delay before scanning after a port hint is detected (in ms) */
const HINT_SCAN_DELAY_MS = 500;

/** Ports to ignore (common system ports that are usually not dev servers) */
const IGNORED_PORTS = new Set([22, 80, 443, 5432, 3306, 6379, 27017]);

/**
 * Check if terminal output contains hints that a port may have been opened.
 * Restricted to phrases that strongly imply a server just started listening;
 * looser patterns like a bare "port 22" or trailing ":12345" are omitted
 * because they match routine log output (ssh banners, timestamps, etc.) and
 * triggered excessive lsof scans — see issue #3372.
 *
 * `Local:  http://localhost:5173/` and `development server at …` are added so
 * Vite, Next.js 14+, and Django get detected on first boot rather than waiting
 * for the next periodic scan.
 */
function containsPortHint(data: string): boolean {
	const portPatterns = [
		/listening\s+on\s+(?:port\s+)?(\d+)/i,
		/server\s+(?:started|running)\s+(?:on|at)\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
		/ready\s+on\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
		/\bLocal:\s+https?:\/\//i,
		/development\s+server\s+at\s+https?:\/\//i,
	];
	return portPatterns.some((pattern) => pattern.test(data));
}

interface SessionEntry {
	workspaceId: string;
	/** PTY process ID — null when the terminal isn't yet spawned (or has exited). */
	pid: number | null;
}

interface ScanState {
	panePortMap: Map<string, { workspaceId: string; pids: number[] }>;
	pidOwnerMap: Map<number, { paneId: string; workspaceId: string }>;
	allPids: Set<number>;
	emptyTreePanes: Set<string>;
}

/**
 * Kills a process tree and escalates to SIGKILL if needed. Callers inject this
 * so the shared package doesn't depend on a particular tree-kill implementation
 * (desktop has one; host-service needs its own).
 */
export type KillFn = (args: {
	pid: number;
}) => Promise<{ success: boolean; error?: string }>;

export interface PortManagerOptions {
	killFn: KillFn;
}

export class PortManager extends EventEmitter {
	private ports = new Map<string, DetectedPort>();
	/** paneId → { workspaceId, pid | null } */
	private sessions = new Map<string, SessionEntry>();
	private scanInterval: ReturnType<typeof setInterval> | null = null;
	private hintScanTimeout: ReturnType<typeof setTimeout> | null = null;
	private isScanning = false;
	/** Set when a hint arrives during a scan; triggers one follow-up scan. */
	private scanRequested = false;
	/** Aborts any in-flight scan children (lsof/netstat) on teardown. */
	private scanAbort: AbortController | null = null;
	private readonly killFn: KillFn;

	constructor(options: PortManagerOptions) {
		super();
		this.killFn = options.killFn;
	}

	/**
	 * Register or update a terminal session for port scanning.
	 * Pass `pid = null` when the terminal hasn't spawned yet; call again with
	 * the real PID once it's known. Safe to call multiple times.
	 */
	upsertSession(paneId: string, workspaceId: string, pid: number | null): void {
		this.sessions.set(paneId, { workspaceId, pid });
		this.ensurePeriodicScanRunning();
	}

	/**
	 * Remove a session and forget any ports it owned.
	 */
	unregisterSession(paneId: string): void {
		this.sessions.delete(paneId);
		this.removePortsForPane(paneId);
		this.stopPeriodicScanIfIdle();
	}

	checkOutputForHint(data: string): void {
		if (!containsPortHint(data)) return;
		this.scheduleHintScan();
	}

	private hasAnySessions(): boolean {
		return this.sessions.size > 0;
	}

	private ensurePeriodicScanRunning(): void {
		if (this.scanInterval) return;

		this.ensureScanAbort();
		this.scanInterval = setInterval(() => {
			this.scanAllSessions().catch((error) => {
				console.error("[PortManager] Scan error:", error);
			});
		}, SCAN_INTERVAL_MS);

		// Don't prevent Node from exiting
		this.scanInterval.unref();
	}

	/**
	 * Lazily allocate the AbortController. Guards against the case where a
	 * pending `hintScanTimeout` fires after `stopPeriodicScan` nulled it out —
	 * without this, the follow-up scan would run with `signal = undefined` and
	 * lsof children would become un-abortable.
	 */
	private ensureScanAbort(): AbortController {
		if (!this.scanAbort) {
			this.scanAbort = new AbortController();
		}
		return this.scanAbort;
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

	private async collectSessionPids(scanState: ScanState): Promise<void> {
		const tasks: Promise<void>[] = [];
		for (const [paneId, { workspaceId, pid }] of this.sessions) {
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
			this.ensureScanAbort().signal,
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
			if (!this.sessions.has(port.paneId)) {
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
			await this.collectSessionPids(scanState);

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
	 * Kill the process listening on a tracked port.
	 * Refuses to kill the terminal's own shell — that would close the pane.
	 * A dev server is always a descendant (different PID), so `killFn` with the
	 * port's owning PID correctly tears down the server without touching the shell.
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

		const shellPid = this.sessions.get(paneId)?.pid;

		if (shellPid != null && detectedPort.pid === shellPid) {
			return Promise.resolve({
				success: false,
				error: "Cannot kill the terminal shell process",
			});
		}

		return this.killFn({ pid: detectedPort.pid });
	}
}
