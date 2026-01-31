import { EventEmitter } from "node:events";
import { workspaces } from "@superset/local-db";
import { track } from "main/lib/analytics";
import { appState } from "main/lib/app-state";
import { localDb } from "main/lib/local-db";
import { HistoryReader, truncateUtf8ToLastBytes } from "../../terminal-history";
import {
	disposeTerminalHostClient,
	getTerminalHostClient,
	type TerminalHostClient,
} from "../../terminal-host/client";
import type { ListSessionsResponse } from "../../terminal-host/types";
import { buildTerminalEnv, getDefaultShell } from "../env";
import { TerminalKilledError } from "../errors";
import { portManager } from "../port-manager";
import type { CreateSessionParams, SessionResult } from "../types";
import {
	CREATE_OR_ATTACH_CONCURRENCY,
	DEBUG_TERMINAL,
	MAX_KILLED_SESSION_TOMBSTONES,
	MAX_SCROLLBACK_BYTES,
	SESSION_CLEANUP_DELAY_MS,
} from "./constants";
import { HistoryManager } from "./history-manager";
import { PrioritySemaphore } from "./priority-semaphore";
import type { ColdRestoreInfo, SessionInfo } from "./types";

export class DaemonTerminalManager extends EventEmitter {
	private client!: TerminalHostClient;
	private sessions = new Map<string, SessionInfo>();
	private pendingSessions = new Map<string, Promise<SessionResult>>();
	private killedSessionTombstones = new Map<string, number>();
	private createOrAttachLimiter = new PrioritySemaphore(
		CREATE_OR_ATTACH_CONCURRENCY,
	);
	private daemonAliveSessionIds = new Set<string>();
	private daemonSessionIdsHydrated = false;

	private historyManager = new HistoryManager();

	private coldRestoreInfo = new Map<string, ColdRestoreInfo>();
	private cleanupTimeouts = new Map<string, NodeJS.Timeout>();

	constructor() {
		super();
		this.initializeClient();
	}

	private recordKilledSession(paneId: string): void {
		this.killedSessionTombstones.delete(paneId);
		this.killedSessionTombstones.set(paneId, Date.now());
		if (this.killedSessionTombstones.size > MAX_KILLED_SESSION_TOMBSTONES) {
			const oldest = this.killedSessionTombstones.keys().next().value;
			if (oldest) {
				this.killedSessionTombstones.delete(oldest);
			}
		}

		const session = this.sessions.get(paneId);
		if (session) {
			session.exitReason = "killed";
			session.killedByUserAt = Date.now();
		}
	}

	private isSessionKilled(paneId: string): boolean {
		return this.killedSessionTombstones.has(paneId);
	}

	private clearKilledSession(paneId: string): void {
		this.killedSessionTombstones.delete(paneId);
	}

	private initializeClient(): void {
		this.client = getTerminalHostClient();
		this.setupClientEventHandlers();
	}

	async reconcileOnStartup(): Promise<void> {
		try {
			const response = await this.client.listSessions();
			if (response.sessions.length === 0) {
				this.daemonAliveSessionIds.clear();
				this.daemonSessionIdsHydrated = true;
				return;
			}

			console.log(
				`[DaemonTerminalManager] Found ${response.sessions.length} sessions from previous run`,
			);

			const validWorkspaceIds = new Set(
				localDb
					.select({ id: workspaces.id })
					.from(workspaces)
					.all()
					.map((w) => w.id),
			);

			let orphanedCount = 0;
			for (const session of response.sessions) {
				if (!validWorkspaceIds.has(session.workspaceId)) {
					console.log(
						`[DaemonTerminalManager] Killing orphaned session ${session.sessionId} (workspace deleted)`,
					);
					await this.client.kill({ sessionId: session.sessionId });
					orphanedCount++;
				}
			}

			// Cache the daemon session inventory so createOrAttach can fast-path
			// existing sessions without touching disk (cold restore check only
			// applies when the daemon does not have a session).
			const preservedSessions = response.sessions.filter(
				(session) =>
					validWorkspaceIds.has(session.workspaceId) && session.isAlive,
			);
			this.daemonAliveSessionIds = new Set(
				preservedSessions.map((session) => session.sessionId),
			);
			this.daemonSessionIdsHydrated = true;

			// Enable port scanning before user opens terminal tabs
			for (const session of preservedSessions) {
				portManager.upsertDaemonSession(
					session.paneId,
					session.workspaceId,
					session.pid,
				);
			}

			const preservedCount = response.sessions.length - orphanedCount;
			if (preservedCount > 0) {
				console.log(
					`[DaemonTerminalManager] Preserving ${preservedCount} sessions for reattach`,
				);
			}
		} catch (error) {
			console.warn(
				"[DaemonTerminalManager] Failed to reconcile sessions:",
				error,
			);
		}
	}

	private async ensureDaemonSessionIdsHydrated(): Promise<void> {
		if (this.daemonSessionIdsHydrated) return;

		try {
			const response = await this.client.listSessions();
			this.daemonAliveSessionIds = new Set(
				response.sessions.filter((s) => s.isAlive).map((s) => s.sessionId),
			);
			this.daemonSessionIdsHydrated = true;
		} catch (error) {
			console.warn(
				"[DaemonTerminalManager] Failed to list daemon sessions:",
				error,
			);
		}
	}

	private setupClientEventHandlers(): void {
		this.client.on("data", (sessionId: string, data: string) => {
			const paneId = sessionId;
			if (DEBUG_TERMINAL) {
				const listenerCount = this.listenerCount(`data:${paneId}`);
				console.log(
					`[DaemonTerminalManager] Received data from daemon: paneId=${paneId}, bytes=${data.length}, listeners=${listenerCount}`,
				);
			}

			const session = this.sessions.get(paneId);
			if (session) {
				session.lastActive = Date.now();
			}

			portManager.checkOutputForHint(data, paneId);
			this.historyManager.writeToHistory(paneId, data, () =>
				this.sessions.get(paneId),
			);
			this.emit(`data:${paneId}`, data);
		});

		this.client.on(
			"exit",
			(sessionId: string, exitCode: number, signal?: number) => {
				const paneId = sessionId;
				this.daemonAliveSessionIds.delete(paneId);

				const session = this.sessions.get(paneId);
				if (session) {
					session.isAlive = false;
					session.pid = null;
				}

				portManager.unregisterDaemonSession(paneId);
				this.historyManager.closeHistoryWriter(paneId, exitCode);
				const reason =
					session?.exitReason ??
					(this.isSessionKilled(paneId) ? "killed" : "exited");
				if (session) {
					session.exitReason = reason;
				}
				this.emit(`exit:${paneId}`, exitCode, signal, reason);
				this.emit("terminalExit", { paneId, exitCode, signal, reason });

				const timeoutId = setTimeout(() => {
					this.sessions.delete(paneId);
					this.cleanupTimeouts.delete(paneId);
				}, SESSION_CLEANUP_DELAY_MS);
				timeoutId.unref();
				this.cleanupTimeouts.set(paneId, timeoutId);
			},
		);

		this.client.on("disconnected", () => {
			console.warn("[DaemonTerminalManager] Disconnected from daemon");
			const activeSessionCount = Array.from(this.sessions.values()).filter(
				(s) => s.isAlive,
			).length;
			track("terminal_daemon_disconnected", {
				active_session_count: activeSessionCount,
			});
			this.daemonAliveSessionIds.clear();
			this.daemonSessionIdsHydrated = false;
			for (const [paneId, session] of this.sessions.entries()) {
				if (session.isAlive) {
					this.emit(
						`disconnect:${paneId}`,
						"Connection to terminal daemon lost",
					);
				}
			}
		});

		this.client.on("error", (error: Error) => {
			console.error("[DaemonTerminalManager] Client error:", error.message);
			this.daemonAliveSessionIds.clear();
			this.daemonSessionIdsHydrated = false;
			for (const [paneId, session] of this.sessions.entries()) {
				if (session.isAlive) {
					this.emit(`disconnect:${paneId}`, error.message);
				}
			}
		});

		this.client.on(
			"terminalError",
			(sessionId: string, error: string, code?: string) => {
				const paneId = sessionId;
				console.error(
					`[DaemonTerminalManager] Terminal error for ${paneId}: ${code ?? "UNKNOWN"}: ${error}`,
				);

				if (error.includes("Session not found")) {
					this.daemonAliveSessionIds.delete(paneId);
					const session = this.sessions.get(paneId);
					if (session) {
						session.isAlive = false;
					}
					console.log(
						`[DaemonTerminalManager] Session ${paneId} lost - will trigger cold restore on next attach`,
					);
				}

				this.emit(`error:${paneId}`, { error, code });
			},
		);
	}

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId } = params;

		if (this.isSessionKilled(paneId)) {
			if (params.allowKilled) {
				this.clearKilledSession(paneId);
			} else {
				throw new TerminalKilledError();
			}
		}

		const pending = this.pendingSessions.get(paneId);
		if (pending) {
			return pending;
		}

		const creationPromise = this.doCreateOrAttach(params);
		this.pendingSessions.set(paneId, creationPromise);

		try {
			return await creationPromise;
		} finally {
			this.pendingSessions.delete(paneId);
		}
	}

	async listDaemonSessions(): Promise<ListSessionsResponse> {
		const response = await this.client.listSessions();
		this.daemonAliveSessionIds = new Set(
			response.sessions.filter((s) => s.isAlive).map((s) => s.sessionId),
		);
		this.daemonSessionIdsHydrated = true;
		return response;
	}

	private async doCreateOrAttach(
		params: CreateSessionParams,
	): Promise<SessionResult> {
		const releaseCreateOrAttach = await this.createOrAttachLimiter.acquire(
			this.getCreateOrAttachPriority(params),
		);
		const {
			paneId,
			tabId,
			workspaceId,
			workspaceName,
			workspacePath,
			rootPath,
			cwd,
			cols = 80,
			rows = 24,
			initialCommands,
			skipColdRestore,
		} = params;

		try {
			if (!skipColdRestore) {
				const stickyRestore = this.coldRestoreInfo.get(paneId);
				if (stickyRestore) {
					return {
						isNew: false,
						scrollback: stickyRestore.scrollback,
						wasRecovered: true,
						isColdRestore: true,
						previousCwd: stickyRestore.previousCwd,
						snapshot: {
							snapshotAnsi: stickyRestore.scrollback,
							rehydrateSequences: "",
							cwd: stickyRestore.previousCwd || null,
							modes: {},
							cols: stickyRestore.cols,
							rows: stickyRestore.rows,
							scrollbackLines: 0,
						},
					};
				}
			}

			if (skipColdRestore) {
				this.coldRestoreInfo.delete(paneId);
			}

			await this.ensureDaemonSessionIdsHydrated();
			const daemonHasSession = this.daemonAliveSessionIds.has(paneId);

			if (!daemonHasSession && !skipColdRestore) {
				const coldRestoreResult = await this.attemptColdRestore({
					paneId,
					workspaceId,
					cols,
					rows,
				});
				if (coldRestoreResult) {
					return coldRestoreResult;
				}
			}

			if (!daemonHasSession && skipColdRestore) {
				await this.historyManager.cleanupHistory(paneId, workspaceId);
			}

			const shell = getDefaultShell();
			const env = buildTerminalEnv({
				shell,
				paneId,
				tabId,
				workspaceId,
				workspaceName,
				workspacePath,
				rootPath,
			});

			if (DEBUG_TERMINAL) {
				console.log("[DaemonTerminalManager] Calling daemon createOrAttach:", {
					paneId,
					shell,
					cwd,
					cols,
					rows,
				});
			}

			const response = await this.client.createOrAttach({
				sessionId: paneId,
				paneId,
				tabId,
				workspaceId,
				workspaceName,
				workspacePath,
				rootPath,
				cols,
				rows,
				cwd,
				env,
				shell,
				initialCommands,
			});

			this.daemonAliveSessionIds.add(paneId);

			const sessionCwd = response.snapshot.cwd || cwd || "";
			const effectiveCols = response.snapshot.cols || cols;
			const effectiveRows = response.snapshot.rows || rows;

			this.cancelPendingCleanup(paneId);

			this.sessions.set(paneId, {
				paneId,
				workspaceId,
				isAlive: true,
				lastActive: Date.now(),
				cwd: sessionCwd,
				pid: response.pid,
				cols: effectiveCols,
				rows: effectiveRows,
			});

			portManager.upsertDaemonSession(paneId, workspaceId, response.pid);

			const snapshotAnsi = response.snapshot.snapshotAnsi || "";
			const snapshotAnsiBytes = Buffer.byteLength(snapshotAnsi, "utf8");
			const initialScrollback =
				snapshotAnsiBytes > MAX_SCROLLBACK_BYTES
					? truncateUtf8ToLastBytes(snapshotAnsi, MAX_SCROLLBACK_BYTES)
					: snapshotAnsi;

			if (effectiveCols >= 1 && effectiveRows >= 1) {
				this.historyManager
					.initHistoryWriter({
						paneId,
						workspaceId,
						cwd: sessionCwd,
						cols: effectiveCols,
						rows: effectiveRows,
						initialScrollback,
					})
					.catch((error) => {
						console.error(
							`[DaemonTerminalManager] Failed to init history for ${paneId}:`,
							error,
						);
					});
			} else {
				console.warn(
					`[DaemonTerminalManager] Skipping history init for ${paneId}: invalid dimensions ${effectiveCols}x${effectiveRows}`,
				);
			}

			if (response.isNew) {
				track("terminal_opened", {
					workspace_id: workspaceId,
					pane_id: paneId,
				});
			} else if (response.wasRecovered) {
				track("terminal_warm_attached", {
					workspace_id: workspaceId,
					pane_id: paneId,
					snapshot_bytes: response.snapshot.snapshotAnsi
						? Buffer.byteLength(response.snapshot.snapshotAnsi, "utf8")
						: 0,
				});
			}

			return {
				isNew: response.isNew,
				scrollback: "",
				wasRecovered: response.wasRecovered,
				snapshot: {
					snapshotAnsi: response.snapshot.snapshotAnsi,
					rehydrateSequences: response.snapshot.rehydrateSequences,
					cwd: response.snapshot.cwd,
					modes: response.snapshot.modes as unknown as Record<string, boolean>,
					cols: response.snapshot.cols,
					rows: response.snapshot.rows,
					scrollbackLines: response.snapshot.scrollbackLines,
					debug: response.snapshot.debug,
				},
			};
		} finally {
			releaseCreateOrAttach();
		}
	}

	private async attemptColdRestore({
		paneId,
		workspaceId,
		cols,
		rows,
	}: {
		paneId: string;
		workspaceId: string;
		cols: number;
		rows: number;
	}): Promise<SessionResult | null> {
		const historyReader = new HistoryReader(workspaceId, paneId);
		const metadata = await historyReader.readMetadata();
		const wasUncleanShutdown = !!metadata && !metadata.endedAt;

		if (!wasUncleanShutdown) {
			return null;
		}

		const rawScrollback = await historyReader.readScrollback();
		if (rawScrollback === null) {
			await historyReader.cleanup();
			return null;
		}

		const rawScrollbackBytes = Buffer.byteLength(rawScrollback, "utf8");
		const scrollback =
			rawScrollbackBytes > MAX_SCROLLBACK_BYTES
				? truncateUtf8ToLastBytes(rawScrollback, MAX_SCROLLBACK_BYTES)
				: rawScrollback;
		const scrollbackBytes = Buffer.byteLength(scrollback, "utf8");

		this.coldRestoreInfo.set(paneId, {
			scrollback,
			previousCwd: metadata.cwd,
			cols: metadata.cols || cols,
			rows: metadata.rows || rows,
		});

		track("terminal_cold_restored", {
			workspace_id: workspaceId,
			pane_id: paneId,
			scrollback_bytes: scrollbackBytes,
		});

		return {
			isNew: false,
			scrollback,
			wasRecovered: true,
			isColdRestore: true,
			previousCwd: metadata.cwd,
			snapshot: {
				snapshotAnsi: scrollback,
				rehydrateSequences: "",
				cwd: metadata.cwd,
				modes: {},
				cols: metadata.cols || cols,
				rows: metadata.rows || rows,
				scrollbackLines: 0,
			},
		};
	}

	private getCreateOrAttachPriority(params: CreateSessionParams): number {
		try {
			const tabsState = appState.data?.tabsState;
			const activeTabId = tabsState?.activeTabIds?.[params.workspaceId];
			const focusedPaneId =
				activeTabId && tabsState?.focusedPaneIds?.[activeTabId];

			const isActiveFocusedPane =
				activeTabId === params.tabId && focusedPaneId === params.paneId;

			return isActiveFocusedPane ? 0 : 1;
		} catch {
			return 1;
		}
	}

	write(params: { paneId: string; data: string }): void {
		const { paneId, data } = params;

		const session = this.sessions.get(paneId);
		if (!session || !session.isAlive) {
			throw new Error(`Terminal session ${paneId} not found or not alive`);
		}

		this.client.writeNoAck({ sessionId: paneId, data });
	}

	ackColdRestore(paneId: string): void {
		this.coldRestoreInfo.delete(paneId);
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const { paneId, cols, rows } = params;

		if (
			!Number.isInteger(cols) ||
			!Number.isInteger(rows) ||
			cols <= 0 ||
			rows <= 0
		) {
			console.warn(
				`[DaemonTerminalManager] Invalid resize geometry for ${paneId}: cols=${cols}, rows=${rows}`,
			);
			return;
		}

		this.client.resize({ sessionId: paneId, cols, rows }).catch((error) => {
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (!errorMsg.includes("not found")) {
				console.error(
					`[DaemonTerminalManager] Resize failed for ${paneId}:`,
					error,
				);
			}
		});

		const session = this.sessions.get(paneId);
		if (session) {
			session.lastActive = Date.now();
			session.cols = cols;
			session.rows = rows;
		}
	}

	signal(params: { paneId: string; signal?: string }): void {
		const { paneId, signal = "SIGINT" } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot signal terminal ${paneId}: session not found or not alive`,
			);
			return;
		}

		this.client.signal({ sessionId: paneId, signal }).catch((error) => {
			console.warn(
				`[DaemonTerminalManager] Failed to send signal ${signal} to ${paneId}:`,
				error,
			);
		});
	}

	async kill(params: {
		paneId: string;
		deleteHistory?: boolean;
	}): Promise<void> {
		const { paneId, deleteHistory = false } = params;
		this.daemonAliveSessionIds.delete(paneId);
		this.recordKilledSession(paneId);

		const session = this.sessions.get(paneId);
		if (session?.isAlive) {
			session.isAlive = false;
			session.pid = null;
		}

		portManager.unregisterDaemonSession(paneId);

		if (deleteHistory && session) {
			await this.historyManager.cleanupHistory(paneId, session.workspaceId);
		} else {
			this.historyManager.closeHistoryWriter(paneId, 0);
		}

		await this.client.kill({ sessionId: paneId, deleteHistory });
	}

	detach(params: { paneId: string }): void {
		const { paneId } = params;

		const session = this.sessions.get(paneId);

		this.client.detach({ sessionId: paneId }).catch((error) => {
			console.error(
				`[DaemonTerminalManager] Detach failed for ${paneId}:`,
				error,
			);
		});

		if (session) {
			session.lastActive = Date.now();
		}
	}

	async clearScrollback(params: { paneId: string }): Promise<void> {
		const { paneId } = params;

		await this.client.clearScrollback({ sessionId: paneId });

		const session = this.sessions.get(paneId);
		if (session) {
			session.lastActive = Date.now();

			const writer = this.historyManager.getHistoryWriter(paneId);
			if (writer) {
				await writer.close().catch((error) => {
					console.warn(
						`[DaemonTerminalManager] Failed to close history writer for ${paneId}:`,
						error,
					);
				});
				try {
					await this.historyManager.initHistoryWriter({
						paneId,
						workspaceId: session.workspaceId,
						cwd: session.cwd,
						cols: session.cols,
						rows: session.rows,
						initialScrollback: undefined,
					});
				} catch (error) {
					console.warn(
						`[DaemonTerminalManager] Failed to reinitialize history writer for ${paneId}:`,
						error,
					);
				}
			}
		}
	}

	async resetHistoryPersistence(): Promise<void> {
		await this.historyManager.resetAll(this.sessions);
	}

	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null {
		const session = this.sessions.get(paneId);
		if (!session) {
			return null;
		}

		return {
			isAlive: session.isAlive,
			cwd: session.cwd,
			lastActive: session.lastActive,
		};
	}

	async killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		const paneIdsToKill = new Set<string>();

		try {
			const response = await this.client.listSessions();
			for (const session of response.sessions) {
				if (session.workspaceId === workspaceId && session.isAlive) {
					paneIdsToKill.add(session.paneId);
				}
			}
		} catch (error) {
			console.warn(
				"[DaemonTerminalManager] Failed to query daemon for sessions:",
				error,
			);
			for (const [paneId, session] of this.sessions.entries()) {
				if (session.workspaceId === workspaceId) {
					paneIdsToKill.add(paneId);
				}
			}
		}

		if (paneIdsToKill.size === 0) {
			return { killed: 0, failed: 0 };
		}

		console.log(
			`[DaemonTerminalManager] Killing ${paneIdsToKill.size} sessions for workspace ${workspaceId}`,
		);

		let killed = 0;
		let failed = 0;

		for (const paneId of paneIdsToKill) {
			try {
				this.recordKilledSession(paneId);

				const session = this.sessions.get(paneId);
				if (session?.isAlive) {
					session.isAlive = false;
					session.pid = null;
				}

				portManager.unregisterDaemonSession(paneId);
				await this.historyManager.cleanupHistory(paneId, workspaceId);

				await this.client.kill({ sessionId: paneId, deleteHistory: true });
				killed++;
			} catch (error) {
				console.error(
					`[DaemonTerminalManager] Failed to kill session ${paneId}:`,
					error,
				);
				failed++;
			}
		}

		if (failed > 0) {
			console.warn(
				`[DaemonTerminalManager] killByWorkspaceId: killed=${killed}, failed=${failed}`,
			);
		}

		return { killed, failed };
	}

	async getSessionCountByWorkspaceId(workspaceId: string): Promise<number> {
		try {
			const response = await this.client.listSessions();
			return response.sessions.filter(
				(s) => s.workspaceId === workspaceId && s.isAlive,
			).length;
		} catch (error) {
			console.warn(
				"[DaemonTerminalManager] Failed to query daemon for session count:",
				error,
			);
			return Array.from(this.sessions.values()).filter(
				(session) => session.workspaceId === workspaceId && session.isAlive,
			).length;
		}
	}

	refreshPromptsForWorkspace(workspaceId: string): void {
		for (const [paneId, session] of this.sessions.entries()) {
			if (session.workspaceId === workspaceId && session.isAlive) {
				this.client.writeNoAck({ sessionId: paneId, data: "\n" });
			}
		}
	}

	detachAllListeners(): void {
		for (const event of this.eventNames()) {
			const name = String(event);
			if (
				name.startsWith("data:") ||
				name.startsWith("exit:") ||
				name.startsWith("disconnect:") ||
				name.startsWith("error:") ||
				name === "terminalExit"
			) {
				this.removeAllListeners(event);
			}
		}
	}

	private cancelPendingCleanup(paneId: string): void {
		const timeout = this.cleanupTimeouts.get(paneId);
		if (timeout) {
			clearTimeout(timeout);
			this.cleanupTimeouts.delete(paneId);
		}
	}

	async cleanup(): Promise<void> {
		for (const timeout of this.cleanupTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.cleanupTimeouts.clear();

		await this.historyManager.cleanup();

		this.sessions.clear();
		this.daemonAliveSessionIds.clear();
		this.daemonSessionIdsHydrated = false;
		this.coldRestoreInfo.clear();
		this.killedSessionTombstones.clear();
		this.removeAllListeners();
		disposeTerminalHostClient();
	}

	async forceKillAll(): Promise<void> {
		const response = await this.client.listSessions().catch(() => ({
			sessions: [],
		}));
		const sessionIds = response.sessions.map((s) => s.sessionId);

		for (const session of response.sessions) {
			if (!session.isAlive) continue;
			this.recordKilledSession(session.sessionId);

			const localSession = this.sessions.get(session.sessionId);
			if (localSession?.isAlive) {
				localSession.isAlive = false;
				localSession.pid = null;
			}
		}

		for (const timeout of this.cleanupTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.cleanupTimeouts.clear();

		await this.historyManager.forceCloseAll();

		await this.client.killAll({});
		for (const paneId of sessionIds) {
			portManager.unregisterDaemonSession(paneId);
		}
		this.daemonAliveSessionIds.clear();
		this.daemonSessionIdsHydrated = true;
		this.coldRestoreInfo.clear();
		this.sessions.clear();
	}

	reset(): void {
		console.log("[DaemonTerminalManager] Resetting...");

		for (const timeout of this.cleanupTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.cleanupTimeouts.clear();
		this.client.removeAllListeners();

		this.sessions.clear();
		this.pendingSessions.clear();
		this.daemonAliveSessionIds.clear();
		this.daemonSessionIdsHydrated = false;
		this.coldRestoreInfo.clear();
		this.killedSessionTombstones.clear();

		this.historyManager.closeAllSync();
		this.createOrAttachLimiter.reset();

		disposeTerminalHostClient();
		this.initializeClient();

		console.log("[DaemonTerminalManager] Reset complete");
	}
}
