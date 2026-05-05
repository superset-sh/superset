import { EventEmitter } from "node:events";
import {
	getListeningPortsForPids,
	getProcessTree,
	type PortInfo,
} from "./scanner.ts";
import type { DetectedPort } from "./types.ts";

/** How often to poll for port changes (in ms) */
const SCAN_INTERVAL_MS = 2500;

/** Delay before scanning after a port hint is detected (in ms) */
const HINT_SCAN_DELAY_MS = 500;

/** Ports to ignore (common system ports that are usually not dev servers) */
const IGNORED_PORTS = new Set([22, 80, 443, 5432, 3306, 6379, 27017]);

const PORT_HINT_PATTERNS = [
	/listening\s+on\s+(?:port\s+)?(\d+)/i,
	/server\s+(?:started|running)\s+(?:on|at)\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
	/ready\s+on\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
	/\bLocal:\s+https?:\/\//i,
	/development\s+server\s+at\s+https?:\/\//i,
];

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
	return PORT_HINT_PATTERNS.some((pattern) => pattern.test(data));
}

function addressRank(address: string): number {
	const normalizedAddress = address.toLowerCase();
	if (normalizedAddress === "127.0.0.1" || normalizedAddress === "localhost") {
		return 0;
	}
	if (normalizedAddress === "0.0.0.0" || normalizedAddress === "*") {
		return 1;
	}
	if (!normalizedAddress.includes(":")) {
		return 2;
	}
	if (normalizedAddress === "::1" || normalizedAddress === "0:0:0:0:0:0:0:1") {
		return 3;
	}
	if (normalizedAddress === "::" || normalizedAddress === "0:0:0:0:0:0:0:0") {
		return 4;
	}
	return 5;
}

function isAbortError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { name?: unknown; code?: unknown };
	return candidate.name === "AbortError" || candidate.code === "ABORT_ERR";
}

function comparePortInfo(a: PortInfo, b: PortInfo): number {
	return (
		a.port - b.port ||
		a.pid - b.pid ||
		a.processName.localeCompare(b.processName) ||
		addressRank(a.address) - addressRank(b.address) ||
		a.address.localeCompare(b.address)
	);
}

function dedupePortInfosByPort(portInfos: PortInfo[]): PortInfo[] {
	const portsByNumber = new Map<number, PortInfo>();

	for (const info of portInfos) {
		const existing = portsByNumber.get(info.port);
		if (!existing || comparePortInfo(info, existing) < 0) {
			portsByNumber.set(info.port, info);
		}
	}

	return Array.from(portsByNumber.values()).sort(comparePortInfo);
}

interface SessionEntry {
	workspaceId: string;
	/** PTY process ID — null when the terminal isn't yet spawned (or has exited). */
	pid: number | null;
}

interface ScanState {
	terminalPortMap: Map<string, { workspaceId: string; pids: number[] }>;
	pidOwnerMap: Map<number, { terminalId: string; workspaceId: string }>;
	allPids: Set<number>;
	emptyTreeTerminals: Set<string>;
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
	/** terminalId → { workspaceId, pid | null } */
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
	upsertSession(
		terminalId: string,
		workspaceId: string,
		pid: number | null,
	): void {
		this.sessions.set(terminalId, { workspaceId, pid });
		this.ensurePeriodicScanRunning();
	}

	/**
	 * Remove a session and forget any ports it owned.
	 */
	unregisterSession(terminalId: string): void {
		this.sessions.delete(terminalId);
		this.removePortsForTerminal(terminalId);
		this.stopPeriodicScanIfIdle();
	}

	checkOutputForHint(data: string): void {
		if (this.hintScanTimeout || this.scanRequested) return;
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
			this.scanAllSessions().catch((error) => {
				console.error("[PortManager] Hint-triggered scan error:", error);
			});
		}, HINT_SCAN_DELAY_MS);
		this.hintScanTimeout.unref();
	}

	private createScanState(): ScanState {
		return {
			terminalPortMap: new Map<
				string,
				{ workspaceId: string; pids: number[] }
			>(),
			pidOwnerMap: new Map<
				number,
				{ terminalId: string; workspaceId: string }
			>(),
			allPids: new Set<number>(),
			emptyTreeTerminals: new Set<string>(),
		};
	}

	private async collectSessionPids(scanState: ScanState): Promise<void> {
		const tasks: Promise<void>[] = [];
		for (const [terminalId, { workspaceId, pid }] of this.sessions) {
			if (pid === null) continue;
			tasks.push(
				this.collectPidTree({
					terminalId,
					workspaceId,
					pid,
					scanState,
				}),
			);
		}
		await Promise.all(tasks);
	}

	private async collectPidTree({
		terminalId,
		workspaceId,
		pid,
		scanState,
	}: {
		terminalId: string;
		workspaceId: string;
		pid: number;
		scanState: ScanState;
	}): Promise<void> {
		try {
			const pids = await getProcessTree(pid);
			if (pids.length === 0) {
				scanState.emptyTreeTerminals.add(terminalId);
				return;
			}

			scanState.terminalPortMap.set(terminalId, { workspaceId, pids });
			this.addTerminalPids({ terminalId, workspaceId, pids, scanState });
		} catch {
			// Session may have exited
		}
	}

	private addTerminalPids({
		terminalId,
		workspaceId,
		pids,
		scanState,
	}: {
		terminalId: string;
		workspaceId: string;
		pids: number[];
		scanState: ScanState;
	}): void {
		for (const childPid of pids) {
			scanState.allPids.add(childPid);
			if (!scanState.pidOwnerMap.has(childPid)) {
				scanState.pidOwnerMap.set(childPid, { terminalId, workspaceId });
			}
		}
	}

	private async buildPortsByTerminal({
		allPids,
		pidOwnerMap,
	}: {
		allPids: Set<number>;
		pidOwnerMap: ScanState["pidOwnerMap"];
	}): Promise<Map<string, PortInfo[]>> {
		const portsByTerminal = new Map<string, PortInfo[]>();
		const allPidList = Array.from(allPids);
		if (allPidList.length === 0) return portsByTerminal;

		const portInfos = await getListeningPortsForPids(
			allPidList,
			this.ensureScanAbort().signal,
		);
		for (const info of portInfos) {
			const owner = pidOwnerMap.get(info.pid);
			if (!owner) continue;
			const existing = portsByTerminal.get(owner.terminalId);
			if (existing) {
				existing.push(info);
			} else {
				portsByTerminal.set(owner.terminalId, [info]);
			}
		}

		return portsByTerminal;
	}

	private updatePortsFromScan({
		terminalPortMap,
		portsByTerminal,
	}: {
		terminalPortMap: ScanState["terminalPortMap"];
		portsByTerminal: Map<string, PortInfo[]>;
	}): void {
		for (const [terminalId, { workspaceId }] of terminalPortMap) {
			const portInfos = portsByTerminal.get(terminalId) ?? [];
			this.updatePortsForTerminal({ terminalId, workspaceId, portInfos });
		}
	}

	private clearEmptyTreeTerminals(emptyTreeTerminals: Set<string>): void {
		for (const terminalId of emptyTreeTerminals) {
			this.removePortsForTerminal(terminalId);
		}
	}

	private cleanupUnregisteredPorts(): void {
		for (const [key, port] of this.ports) {
			if (!this.sessions.has(port.terminalId)) {
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

			const portsByTerminal = await this.buildPortsByTerminal({
				allPids: scanState.allPids,
				pidOwnerMap: scanState.pidOwnerMap,
			});

			this.updatePortsFromScan({
				terminalPortMap: scanState.terminalPortMap,
				portsByTerminal,
			});
			this.clearEmptyTreeTerminals(scanState.emptyTreeTerminals);
			this.cleanupUnregisteredPorts();
		} catch (error) {
			if (isAbortError(error)) return;
			throw error;
		} finally {
			this.isScanning = false;
		}

		if (this.scanRequested && this.hasAnySessions()) {
			this.scanRequested = false;
			await this.scanAllSessions();
		}
	}

	private updatePortsForTerminal({
		terminalId,
		workspaceId,
		portInfos,
	}: {
		terminalId: string;
		workspaceId: string;
		portInfos: PortInfo[];
	}): void {
		const now = Date.now();

		const validPortInfos = portInfos.filter(
			(info) => !IGNORED_PORTS.has(info.port),
		);
		const dedupedPortInfos = dedupePortInfosByPort(validPortInfos);

		const seenKeys = new Set<string>();

		for (const info of dedupedPortInfos) {
			const key = this.makeKey(terminalId, info.port);
			seenKeys.add(key);

			const existing = this.ports.get(key);
			if (!existing) {
				const detectedPort: DetectedPort = {
					port: info.port,
					pid: info.pid,
					processName: info.processName,
					terminalId,
					workspaceId,
					detectedAt: now,
					address: info.address,
				};
				this.ports.set(key, detectedPort);
				this.emit("port:add", detectedPort);
			} else if (
				existing.pid !== info.pid ||
				existing.processName !== info.processName ||
				existing.address !== info.address
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
			if (port.terminalId === terminalId && !seenKeys.has(key)) {
				this.ports.delete(key);
				this.emit("port:remove", port);
			}
		}
	}

	private makeKey(terminalId: string, port: number): string {
		return `${terminalId}:${port}`;
	}

	removePortsForTerminal(terminalId: string): void {
		const portsToRemove: DetectedPort[] = [];

		for (const [key, port] of this.ports) {
			if (port.terminalId === terminalId) {
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
	 * Refuses to kill the terminal's own shell — that would close the terminal.
	 * A dev server is always a descendant (different PID), so `killFn` with the
	 * port's owning PID correctly tears down the server without touching the shell.
	 */
	killPort({
		terminalId,
		workspaceId,
		port,
	}: {
		terminalId: string;
		workspaceId: string;
		port: number;
	}): Promise<{
		success: boolean;
		error?: string;
	}> {
		const key = this.makeKey(terminalId, port);
		const detectedPort = this.ports.get(key);

		if (!detectedPort) {
			return Promise.resolve({
				success: false,
				error: "Port not found in tracked ports",
			});
		}

		if (detectedPort.workspaceId !== workspaceId) {
			return Promise.resolve({
				success: false,
				error: "Port does not belong to the requested workspace",
			});
		}

		const shellPid = this.sessions.get(terminalId)?.pid;

		if (shellPid != null && detectedPort.pid === shellPid) {
			return Promise.resolve({
				success: false,
				error: "Cannot kill the terminal shell process",
			});
		}

		return this.killFn({ pid: detectedPort.pid });
	}
}
