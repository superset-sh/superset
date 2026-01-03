/**
 * Daemon-based Terminal Manager
 *
 * This version of TerminalManager delegates PTY operations to the
 * terminal host daemon for persistence across app restarts.
 *
 * The daemon owns the PTYs and maintains terminal state. This manager
 * maintains the same EventEmitter interface as the original for
 * compatibility with existing TRPC router and renderer code.
 */

import { EventEmitter } from "node:events";
import { track } from "main/lib/analytics";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../terminal-escape-filter";
import { HistoryReader, HistoryWriter } from "../terminal-history";
import {
	disposeTerminalHostClient,
	getTerminalHostClient,
	type TerminalHostClient,
} from "../terminal-host/client";
import { buildTerminalEnv, getDefaultShell } from "./env";
import { portManager } from "./port-manager";
import type { CreateSessionParams, SessionResult } from "./types";

// =============================================================================
// Constants
// =============================================================================

/** Delay before removing session from local cache after exit event */
const SESSION_CLEANUP_DELAY_MS = 5000;

// =============================================================================
// Types
// =============================================================================

interface SessionInfo {
	paneId: string;
	workspaceId: string;
	isAlive: boolean;
	lastActive: number;
	cwd: string;
}

// =============================================================================
// DaemonTerminalManager
// =============================================================================

export class DaemonTerminalManager extends EventEmitter {
	private client: TerminalHostClient;
	private sessions = new Map<string, SessionInfo>();
	private pendingSessions = new Map<string, Promise<SessionResult>>();

	/** History writers for persisting scrollback to disk (for reboot recovery) */
	private historyWriters = new Map<string, HistoryWriter>();

	/** Buffer for data received before history writer is initialized */
	private pendingHistoryData = new Map<string, string[]>();

	/** Track sessions that are initializing history (to know when to buffer) */
	private historyInitializing = new Set<string>();

	/**
	 * Sticky cold restore info - survives multiple createOrAttach calls.
	 * This ensures React StrictMode double-mounts still see cold restore.
	 * Cleared when renderer acknowledges via ackColdRestore().
	 */
	private coldRestoreInfo = new Map<
		string,
		{
			scrollback: string;
			previousCwd: string | undefined;
			cols: number;
			rows: number;
		}
	>();

	constructor() {
		super();
		this.client = getTerminalHostClient();
		this.setupClientEventHandlers();
	}

	/**
	 * Set up event handlers to forward daemon events to local EventEmitter
	 */
	private setupClientEventHandlers(): void {
		// Forward data events
		this.client.on("data", (sessionId: string, data: string) => {
			// The sessionId from daemon is the paneId
			const paneId = sessionId;

			// Update session state
			const session = this.sessions.get(paneId);
			if (session) {
				session.lastActive = Date.now();
			}

			// Scan for port patterns
			const workspaceId = session?.workspaceId;
			if (workspaceId) {
				portManager.scanOutput(data, paneId, workspaceId);
			}

			// Write to history file for reboot persistence
			this.writeToHistory(paneId, data);

			// Emit to listeners (TRPC router subscription)
			this.emit(`data:${paneId}`, data);
		});

		// Forward exit events
		this.client.on(
			"exit",
			(sessionId: string, exitCode: number, signal?: number) => {
				const paneId = sessionId;

				// Update session state
				const session = this.sessions.get(paneId);
				if (session) {
					session.isAlive = false;
				}

				// Clean up detected ports
				portManager.removePortsForPane(paneId);

				// Close history writer with exit code (writes endedAt to meta.json)
				this.closeHistoryWriter(paneId, exitCode);

				// Emit exit event
				this.emit(`exit:${paneId}`, exitCode, signal);

				// Clean up session after delay
				setTimeout(() => {
					this.sessions.delete(paneId);
				}, SESSION_CLEANUP_DELAY_MS);
			},
		);

		// Handle client disconnection - notify all active sessions
		this.client.on("disconnected", () => {
			console.warn("[DaemonTerminalManager] Disconnected from daemon");
			// Emit disconnect event for all active sessions so terminals can show error UI
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
			// Emit error event for all active sessions
			for (const [paneId, session] of this.sessions.entries()) {
				if (session.isAlive) {
					this.emit(`disconnect:${paneId}`, error.message);
				}
			}
		});

		// Terminal-specific errors (e.g., subprocess backpressure limits)
		this.client.on(
			"terminalError",
			(sessionId: string, error: string, code?: string) => {
				const paneId = sessionId;
				console.error(
					`[DaemonTerminalManager] Terminal error for ${paneId}: ${code ?? "UNKNOWN"}: ${error}`,
				);
				this.emit(`error:${paneId}`, { error, code });
			},
		);
	}

	// ===========================================================================
	// History Persistence (for reboot recovery)
	// ===========================================================================

	/**
	 * Initialize a history writer for a session.
	 * Called after createOrAttach succeeds.
	 */
	private async initHistoryWriter(
		paneId: string,
		workspaceId: string,
		cwd: string,
		cols: number,
		rows: number,
		initialScrollback?: string,
	): Promise<void> {
		// Mark as initializing so data events get buffered
		this.historyInitializing.add(paneId);
		this.pendingHistoryData.set(paneId, []);

		try {
			const writer = new HistoryWriter(workspaceId, paneId, cwd, cols, rows);
			await writer.init(initialScrollback);
			this.historyWriters.set(paneId, writer);

			// Flush any buffered data
			const buffered = this.pendingHistoryData.get(paneId) || [];
			for (const data of buffered) {
				this.writeToHistory(paneId, data);
			}
		} catch (error) {
			console.error(
				`[DaemonTerminalManager] Failed to init history writer for ${paneId}:`,
				error,
			);
		} finally {
			this.historyInitializing.delete(paneId);
			this.pendingHistoryData.delete(paneId);
		}
	}

	/**
	 * Write data to history file.
	 * Handles clear scrollback detection and buffering during init.
	 */
	private writeToHistory(paneId: string, data: string): void {
		// If still initializing, buffer the data
		if (this.historyInitializing.has(paneId)) {
			const buffer = this.pendingHistoryData.get(paneId);
			if (buffer) {
				buffer.push(data);
			}
			return;
		}

		const writer = this.historyWriters.get(paneId);
		if (!writer) {
			return;
		}

		// Handle clear scrollback (Cmd+K) - reinitialize history
		if (containsClearScrollbackSequence(data)) {
			const session = this.sessions.get(paneId);
			if (session) {
				// Close current writer and reinitialize with empty scrollback
				writer.close().catch(() => {});
				this.historyWriters.delete(paneId);

				// Create new writer (will only contain content after clear)
				const contentAfterClear = extractContentAfterClear(data);
				this.initHistoryWriter(
					paneId,
					session.workspaceId,
					session.cwd,
					80, // cols - will be updated on next resize
					24, // rows - will be updated on next resize
					contentAfterClear || undefined,
				).catch(() => {});
			}
			return;
		}

		// Normal write
		writer.write(data);
	}

	/**
	 * Close a history writer and write endedAt to meta.json.
	 */
	private closeHistoryWriter(paneId: string, exitCode?: number): void {
		const writer = this.historyWriters.get(paneId);
		if (writer) {
			writer.close(exitCode).catch((error) => {
				console.error(
					`[DaemonTerminalManager] Failed to close history writer for ${paneId}:`,
					error,
				);
			});
			this.historyWriters.delete(paneId);
		}

		// Clean up any pending data
		this.historyInitializing.delete(paneId);
		this.pendingHistoryData.delete(paneId);
	}

	/**
	 * Clean up history files for a session.
	 */
	private async cleanupHistory(
		paneId: string,
		workspaceId: string,
	): Promise<void> {
		this.closeHistoryWriter(paneId);

		try {
			const reader = new HistoryReader(workspaceId, paneId);
			await reader.cleanup();
		} catch (error) {
			console.error(
				`[DaemonTerminalManager] Failed to cleanup history for ${paneId}:`,
				error,
			);
		}
	}

	// ===========================================================================
	// Public API (matches original TerminalManager interface)
	// ===========================================================================

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId } = params;

		// Deduplicate concurrent calls
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

	private async doCreateOrAttach(
		params: CreateSessionParams,
	): Promise<SessionResult> {
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
		} = params;

		// FIRST: Check for sticky cold restore info (survives React StrictMode remounts)
		// This ensures the second mount still sees the cold restore detected on first mount
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

		// Check for cold restore: read existing history from disk BEFORE calling daemon
		// This detects if there's scrollback from a previous session that ended uncleanly
		const historyReader = new HistoryReader(workspaceId, paneId);
		const existingHistory = await historyReader.read();
		const hasPreviousSession =
			!!existingHistory.metadata && !!existingHistory.scrollback;
		const wasUncleanShutdown =
			hasPreviousSession && !existingHistory.metadata?.endedAt;

		// Build environment for the terminal
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

		// Call daemon
		const response = await this.client.createOrAttach({
			sessionId: paneId, // Use paneId as sessionId for simplicity
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

		// Detect cold restore: daemon created new session but we have unclean history
		const isColdRestore = response.isNew && wasUncleanShutdown;

		// For cold restore, use the previous session's cwd; otherwise use daemon's cwd
		const previousCwd = existingHistory.metadata?.cwd;
		const sessionCwd = isColdRestore
			? previousCwd || cwd || ""
			: response.snapshot.cwd || cwd || "";

		// Track session locally
		this.sessions.set(paneId, {
			paneId,
			workspaceId,
			isAlive: true,
			lastActive: Date.now(),
			cwd: sessionCwd,
		});

		// Initialize history writer for reboot persistence
		// For cold restore: start fresh (scrollback is read-only display)
		// For recovered session: include existing scrollback
		// For new session: start empty
		const initialScrollback = response.wasRecovered
			? response.snapshot.snapshotAnsi
			: undefined;
		this.initHistoryWriter(
			paneId,
			workspaceId,
			sessionCwd,
			response.snapshot.cols || cols,
			response.snapshot.rows || rows,
			initialScrollback,
		).catch((error) => {
			console.error(
				`[DaemonTerminalManager] Failed to init history for ${paneId}:`,
				error,
			);
		});

		// Track terminal opened (but not for cold restore - that's a continuation)
		if (response.isNew && !isColdRestore) {
			track("terminal_opened", { workspace_id: workspaceId, pane_id: paneId });
		}

		// For cold restore, return disk scrollback instead of daemon snapshot
		if (isColdRestore) {
			// Cap scrollback size for performance (matches non-daemon mode)
			const MAX_SCROLLBACK_CHARS = 500_000;
			const scrollback =
				existingHistory.scrollback.length > MAX_SCROLLBACK_CHARS
					? existingHistory.scrollback.slice(-MAX_SCROLLBACK_CHARS)
					: existingHistory.scrollback;

			// Store in sticky map - survives React StrictMode remounts
			// Renderer must call ackColdRestore() to clear this
			this.coldRestoreInfo.set(paneId, {
				scrollback,
				previousCwd: previousCwd || undefined,
				cols: existingHistory.metadata?.cols || cols,
				rows: existingHistory.metadata?.rows || rows,
			});

			return {
				isNew: false, // Not truly new - we're restoring
				scrollback: scrollback,
				wasRecovered: true,
				isColdRestore: true,
				previousCwd: previousCwd || undefined,
				snapshot: {
					snapshotAnsi: scrollback,
					rehydrateSequences: "",
					cwd: previousCwd || null,
					modes: {},
					cols: existingHistory.metadata?.cols || cols,
					rows: existingHistory.metadata?.rows || rows,
					scrollbackLines: 0,
				},
			};
		}

		return {
			isNew: response.isNew,
			// In daemon mode, snapshot.snapshotAnsi is the canonical content source.
			// We set scrollback to empty to avoid duplicating the payload over IPC.
			// The renderer should prefer snapshot.snapshotAnsi when available.
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
	}

	write(params: { paneId: string; data: string }): void {
		const { paneId, data } = params;

		const session = this.sessions.get(paneId);
		if (!session || !session.isAlive) {
			throw new Error(`Terminal session ${paneId} not found or not alive`);
		}

		// Fire and forget - daemon will handle the write.
		// Use the no-ack fast path to avoid per-chunk request timeouts under load.
		this.client.writeNoAck({ sessionId: paneId, data });
	}

	/**
	 * Acknowledge cold restore - clears the sticky cold restore info.
	 * Call this after the renderer has displayed the cold restore UI
	 * and the user has started a new shell.
	 */
	ackColdRestore(paneId: string): void {
		if (this.coldRestoreInfo.has(paneId)) {
			this.coldRestoreInfo.delete(paneId);
		}
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const { paneId, cols, rows } = params;

		// Validate geometry
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

		const session = this.sessions.get(paneId);
		if (!session || !session.isAlive) {
			console.warn(
				`Cannot resize terminal ${paneId}: session not found or not alive`,
			);
			return;
		}

		// Fire and forget
		this.client.resize({ sessionId: paneId, cols, rows }).catch((error) => {
			console.error(
				`[DaemonTerminalManager] Resize failed for ${paneId}:`,
				error,
			);
		});

		session.lastActive = Date.now();
	}

	signal(params: { paneId: string; signal?: string }): void {
		const { paneId, signal = "SIGTERM" } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot signal terminal ${paneId}: session not found or not alive`,
			);
			return;
		}

		// Daemon doesn't have a signal method, use kill
		// For now, just log - we may need to add signal support to daemon
		console.warn(
			`[DaemonTerminalManager] Signal ${signal} not yet supported for daemon sessions`,
		);
	}

	async kill(params: {
		paneId: string;
		deleteHistory?: boolean;
	}): Promise<void> {
		const { paneId, deleteHistory = false } = params;

		// Emit exit event BEFORE killing so tRPC subscriptions complete cleanly.
		// This prevents WRITE_FAILED errors when the daemon kills the session
		// but React components are still mounted with active subscriptions.
		// The daemon will also emit an exit event, but duplicate events are
		// harmless since emit.complete() has already been called.
		const session = this.sessions.get(paneId);
		if (session?.isAlive) {
			session.isAlive = false;
			this.emit(`exit:${paneId}`, 0, "SIGTERM");
		}

		// Close and optionally delete history
		if (deleteHistory && session) {
			await this.cleanupHistory(paneId, session.workspaceId);
		} else {
			this.closeHistoryWriter(paneId, 0);
		}

		await this.client.kill({ sessionId: paneId, deleteHistory });
	}

	detach(params: { paneId: string }): void {
		const { paneId } = params;

		const session = this.sessions.get(paneId);
		if (!session) {
			console.warn(`Cannot detach terminal ${paneId}: session not found`);
			return;
		}

		// Fire and forget
		this.client.detach({ sessionId: paneId }).catch((error) => {
			console.error(
				`[DaemonTerminalManager] Detach failed for ${paneId}:`,
				error,
			);
		});

		session.lastActive = Date.now();
	}

	async clearScrollback(params: { paneId: string }): Promise<void> {
		const { paneId } = params;

		await this.client.clearScrollback({ sessionId: paneId });

		const session = this.sessions.get(paneId);
		if (session) {
			session.lastActive = Date.now();

			// Reinitialize history file (clear the scrollback on disk too)
			const writer = this.historyWriters.get(paneId);
			if (writer) {
				await writer.close().catch(() => {});
				this.historyWriters.delete(paneId);
				await this.initHistoryWriter(
					paneId,
					session.workspaceId,
					session.cwd,
					80,
					24,
					undefined,
				);
			}
		}
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
		// Always query daemon for the authoritative list of sessions
		// Local sessions map may be incomplete after app restart
		const paneIdsToKill = new Set<string>();

		// Query daemon for all sessions in this workspace
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
			// Fall back to local sessions if daemon query fails
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
				// Emit exit event BEFORE killing so tRPC subscriptions complete cleanly.
				// This prevents WRITE_FAILED error toast floods when deleting workspaces.
				const session = this.sessions.get(paneId);
				if (session?.isAlive) {
					session.isAlive = false;
					this.emit(`exit:${paneId}`, 0, "SIGTERM");
				}

				// Clean up history files when deleting workspace
				await this.cleanupHistory(paneId, workspaceId);

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
		// Always query daemon for the authoritative count
		// Local sessions map may be incomplete after app restart
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
			// Fall back to local sessions if daemon query fails
			return Array.from(this.sessions.values()).filter(
				(session) => session.workspaceId === workspaceId && session.isAlive,
			).length;
		}
	}

	/**
	 * Send a newline to all terminals in a workspace to refresh their prompts.
	 */
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
				name.startsWith("error:")
			) {
				this.removeAllListeners(event);
			}
		}
	}

	/**
	 * Cleanup on app quit.
	 *
	 * IMPORTANT: In daemon mode, we intentionally do NOT kill sessions.
	 * The whole point of the daemon is to persist terminals across app restarts.
	 * We only disconnect from the daemon and clear local state.
	 *
	 * We DO close history writers gracefully so meta.json gets endedAt written.
	 * This allows cold restore detection on next app launch.
	 */
	async cleanup(): Promise<void> {
		// Close all history writers gracefully (writes endedAt to meta.json)
		// This is important for cold restore detection - if the app crashes
		// or laptop reboots, endedAt won't be written, indicating unclean shutdown.
		const closePromises: Promise<void>[] = [];
		for (const [paneId, writer] of this.historyWriters.entries()) {
			closePromises.push(
				writer.close().catch((error) => {
					console.error(
						`[DaemonTerminalManager] Failed to close history for ${paneId}:`,
						error,
					);
				}),
			);
		}
		await Promise.all(closePromises);
		this.historyWriters.clear();
		this.historyInitializing.clear();
		this.pendingHistoryData.clear();

		// Disconnect from daemon but DON'T kill sessions - they should persist
		// across app restarts. This is the core feature of daemon mode.
		this.sessions.clear();
		this.removeAllListeners();
		disposeTerminalHostClient();
	}

	/**
	 * Forcefully kill all sessions in the daemon.
	 * Only use this when you explicitly want to destroy all terminals,
	 * not during normal app shutdown.
	 */
	async forceKillAll(): Promise<void> {
		// Close all history writers
		for (const writer of this.historyWriters.values()) {
			await writer.close().catch(() => {});
		}
		this.historyWriters.clear();
		this.historyInitializing.clear();
		this.pendingHistoryData.clear();

		await this.client.killAll({});
		this.sessions.clear();
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let daemonManager: DaemonTerminalManager | null = null;

export function getDaemonTerminalManager(): DaemonTerminalManager {
	if (!daemonManager) {
		daemonManager = new DaemonTerminalManager();
	}
	return daemonManager;
}

/**
 * Dispose the daemon manager singleton.
 * Must be called when the terminal host client is disposed (e.g., daemon restart)
 * to ensure the manager gets a fresh client reference on next use.
 */
export function disposeDaemonManager(): void {
	if (daemonManager) {
		daemonManager.removeAllListeners();
		daemonManager = null;
	}
}
