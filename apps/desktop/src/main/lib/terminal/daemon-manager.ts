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
import { workspaces } from "@superset/local-db";
import { track } from "main/lib/analytics";
import { appState } from "main/lib/app-state";
import { localDb } from "main/lib/local-db";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../terminal-escape-filter";
import {
	HistoryReader,
	HistoryWriter,
	truncateUtf8ToLastBytes,
} from "../terminal-history";
import {
	disposeTerminalHostClient,
	getTerminalHostClient,
	type TerminalHostClient,
} from "../terminal-host/client";
import type { ListSessionsResponse } from "../terminal-host/types";
import { buildTerminalEnv, getDefaultShell } from "./env";
import { portManager } from "./port-manager";
import type { CreateSessionParams, SessionResult } from "./types";

// =============================================================================
// Constants
// =============================================================================

/** Delay before removing session from local cache after exit event */
const SESSION_CLEANUP_DELAY_MS = 5000;
const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";
const CREATE_OR_ATTACH_CONCURRENCY = 3;

// =============================================================================
// Types
// =============================================================================

interface SessionInfo {
	paneId: string;
	workspaceId: string;
	isAlive: boolean;
	lastActive: number;
	cwd: string;
	/** PTY process ID for port scanning (null if not yet spawned or exited) */
	pid: number | null;
	cols: number;
	rows: number;
	/** Saved viewport scroll position for restoration on reattach */
	viewportY?: number;
}

// =============================================================================
// DaemonTerminalManager
// =============================================================================

export class DaemonTerminalManager extends EventEmitter {
	private client: TerminalHostClient;
	private sessions = new Map<string, SessionInfo>();
	private pendingSessions = new Map<string, Promise<SessionResult>>();
	private createOrAttachLimiter = new PrioritySemaphore(
		CREATE_OR_ATTACH_CONCURRENCY,
	);
	private daemonAliveSessionIds = new Set<string>();
	private daemonSessionIdsHydrated = false;

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

	/** Track pending cleanup timeouts for cancellation on dispose */
	private cleanupTimeouts = new Map<string, NodeJS.Timeout>();

	constructor() {
		super();
		this.client = getTerminalHostClient();
		this.setupClientEventHandlers();
	}

	/**
	 * Reconcile daemon sessions on app startup.
	 * Sessions are preserved for reattachment when renderer restores panes.
	 * Orphaned sessions (workspaces deleted while app was closed) are cleaned up.
	 */
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

			// Get valid workspace IDs from database
			const validWorkspaceIds = new Set(
				localDb
					.select({ id: workspaces.id })
					.from(workspaces)
					.all()
					.map((w) => w.id),
			);

			// Kill sessions for deleted workspaces, keep others for reattach
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

	/**
	 * Set up event handlers to forward daemon events to local EventEmitter
	 */
	private setupClientEventHandlers(): void {
		// Forward data events
		this.client.on("data", (sessionId: string, data: string) => {
			// The sessionId from daemon is the paneId
			const paneId = sessionId;
			if (DEBUG_TERMINAL) {
				const listenerCount = this.listenerCount(`data:${paneId}`);
				console.log(
					`[DaemonTerminalManager] Received data from daemon: paneId=${paneId}, bytes=${data.length}, listeners=${listenerCount}`,
				);
			}

			// Update session state
			const session = this.sessions.get(paneId);
			if (session) {
				session.lastActive = Date.now();
			}

			// Check for port hints in output (triggers process-based scan)
			portManager.checkOutputForHint(data, paneId);

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
				this.daemonAliveSessionIds.delete(paneId);

				// Update session state
				const session = this.sessions.get(paneId);
				if (session) {
					session.isAlive = false;
					session.pid = null; // PTY is gone
				}

				// Unregister from port manager (clears ports and cancels pending scans)
				portManager.unregisterDaemonSession(paneId);

				// Close history writer with exit code (writes endedAt to meta.json)
				this.closeHistoryWriter(paneId, exitCode);

				// Emit exit event
				this.emit(`exit:${paneId}`, exitCode, signal);
				this.emit("terminalExit", { paneId, exitCode, signal });

				// Clean up session after delay (track timeout for cancellation on dispose)
				const timeoutId = setTimeout(() => {
					this.sessions.delete(paneId);
					this.cleanupTimeouts.delete(paneId);
				}, SESSION_CLEANUP_DELAY_MS);
				this.cleanupTimeouts.set(paneId, timeoutId);
			},
		);

		// Handle client disconnection - notify all active sessions
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
			this.daemonAliveSessionIds.clear();
			this.daemonSessionIdsHydrated = false;
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

				// "Session not found" means daemon restarted and lost this session.
				// Clear the stale cache entry so next createOrAttach triggers cold restore.
				if (error.includes("Session not found")) {
					this.daemonAliveSessionIds.delete(paneId);
					// Also mark session as not alive in our local tracking
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

		// Safety check: validate and cap initialScrollback to prevent RangeError
		// Large snapshots can cause Buffer.from() to fail with "Invalid array length"
		const MAX_SCROLLBACK_BYTES = 512 * 1024; // 512KB
		let safeScrollback = initialScrollback;
		if (initialScrollback !== undefined) {
			if (typeof initialScrollback !== "string") {
				console.warn(
					`[DaemonTerminalManager] initialScrollback for ${paneId} is not a string, ignoring`,
				);
				safeScrollback = undefined;
			} else {
				const initialScrollbackBytes = Buffer.byteLength(
					initialScrollback,
					"utf8",
				);
				if (initialScrollbackBytes > MAX_SCROLLBACK_BYTES) {
					console.warn(
						`[DaemonTerminalManager] initialScrollback for ${paneId} too large (${initialScrollbackBytes} bytes), truncating to ${MAX_SCROLLBACK_BYTES}`,
					);
					// Keep the most recent content (end of scrollback)
					safeScrollback = truncateUtf8ToLastBytes(
						initialScrollback,
						MAX_SCROLLBACK_BYTES,
					);
				}
			}
		}

		try {
			const writer = new HistoryWriter(workspaceId, paneId, cwd, cols, rows);
			await writer.init(safeScrollback);
			this.historyWriters.set(paneId, writer);

			// Flush any buffered data. Important: mark init as complete BEFORE replaying,
			// otherwise writeToHistory() would re-buffer into the same array we're
			// iterating (infinite loop / RangeError: Invalid array length).
			const buffered = this.pendingHistoryData.get(paneId) || [];
			this.historyInitializing.delete(paneId);
			this.pendingHistoryData.delete(paneId);
			for (const data of buffered) {
				writer.write(data);
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
				writer.close().catch((error) => {
					console.warn(
						`[DaemonTerminalManager] Failed to close history writer for ${paneId}:`,
						error,
					);
				});
				this.historyWriters.delete(paneId);

				// Create new writer (will only contain content after clear)
				const contentAfterClear = extractContentAfterClear(data);
				this.initHistoryWriter(
					paneId,
					session.workspaceId,
					session.cwd,
					session.cols,
					session.rows,
					contentAfterClear || undefined,
				).catch((error) => {
					console.warn(
						`[DaemonTerminalManager] Failed to reinitialize history writer for ${paneId}:`,
						error,
					);
				});
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

		const MAX_SCROLLBACK_BYTES = 500_000;

		try {
			// Sticky cold restore info (survives React StrictMode remounts).
			// The renderer must call ackColdRestore() to clear this.
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

			// Attach fast-path: if the daemon already has the session, don't touch disk.
			await this.ensureDaemonSessionIdsHydrated();
			const daemonHasSession = this.daemonAliveSessionIds.has(paneId);

			// Cold restore: only applies when the daemon does not have the session.
			if (!daemonHasSession && !skipColdRestore) {
				const historyReader = new HistoryReader(workspaceId, paneId);
				const metadata = await historyReader.readMetadata();
				const wasUncleanShutdown = !!metadata && !metadata.endedAt;

				if (wasUncleanShutdown) {
					const rawScrollback = await historyReader.readScrollback();
					// Handle null scrollback (no history available).
					// Note: empty string is valid (TUI apps in alt screen may have empty normal buffer).
					if (rawScrollback === null) {
						await historyReader.cleanup();
						// Fall through to create new session
					} else {
						const rawScrollbackBytes = Buffer.byteLength(rawScrollback, "utf8");
						const scrollback =
							rawScrollbackBytes > MAX_SCROLLBACK_BYTES
								? truncateUtf8ToLastBytes(rawScrollback, MAX_SCROLLBACK_BYTES)
								: rawScrollback;
						const scrollbackBytes = Buffer.byteLength(scrollback, "utf8");

						// Store sticky info so StrictMode remounts still show cold restore.
						this.coldRestoreInfo.set(paneId, {
							scrollback,
							previousCwd: metadata.cwd,
							cols: metadata.cols || cols,
							rows: metadata.rows || rows,
						});

						// Track cold restore event
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
				}
			}

			// If the user explicitly starts a new shell after cold restore, clear the
			// on-disk history so we don't re-trigger cold restore on the next attach.
			if (!daemonHasSession && skipColdRestore) {
				await this.cleanupHistory(paneId, workspaceId);
			}

			// Build environment for the terminal.
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

			// Create or attach via daemon.
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

			this.daemonAliveSessionIds.add(paneId);

			const sessionCwd = response.snapshot.cwd || cwd || "";

			// Guard against invalid dimensions (can happen if terminal not yet sized).
			const effectiveCols = response.snapshot.cols || cols;
			const effectiveRows = response.snapshot.rows || rows;

			// Track session locally.
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

			// Register with port manager for process-based port scanning.
			// PID may be null if PTY not yet spawned or has exited.
			portManager.upsertDaemonSession(paneId, workspaceId, response.pid);

			// Initialize history writer for reboot persistence.
			const snapshotAnsi = response.snapshot.snapshotAnsi || "";
			const snapshotAnsiBytes = Buffer.byteLength(snapshotAnsi, "utf8");
			const initialScrollback =
				snapshotAnsiBytes > MAX_SCROLLBACK_BYTES
					? truncateUtf8ToLastBytes(snapshotAnsi, MAX_SCROLLBACK_BYTES)
					: snapshotAnsi;

			if (effectiveCols >= 1 && effectiveRows >= 1) {
				this.initHistoryWriter(
					paneId,
					workspaceId,
					sessionCwd,
					effectiveCols,
					effectiveRows,
					initialScrollback,
				).catch((error) => {
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

			// Track terminal events
			if (response.isNew) {
				track("terminal_opened", {
					workspace_id: workspaceId,
					pane_id: paneId,
				});
			} else if (response.wasRecovered) {
				// Warm attach - reconnected to existing daemon session
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
				// In daemon mode, snapshot.snapshotAnsi is the canonical content source.
				// We set scrollback to empty to avoid duplicating the payload over IPC.
				// The renderer should prefer snapshot.snapshotAnsi when available.
				scrollback: "",
				wasRecovered: response.wasRecovered,
				viewportY: this.sessions.get(paneId)?.viewportY,
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
			// If appState isn't initialized yet or is otherwise unavailable, treat all
			// requests as the same priority.
			return 1;
		}
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

		// Fire and forget to daemon - don't require local session cache
		// This handles startup race where renderer sends resize before createOrAttach completes
		// Daemon will silently ignore resize for non-existent sessions
		this.client.resize({ sessionId: paneId, cols, rows }).catch((error) => {
			// Only log if it's not a "session not found" error (expected during startup)
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (!errorMsg.includes("not found")) {
				console.error(
					`[DaemonTerminalManager] Resize failed for ${paneId}:`,
					error,
				);
			}
		});

		// Update local session if we have it
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

		// Send signal to daemon (fire and forget)
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

		// Emit exit event BEFORE killing so the renderer can stop sending input.
		// This prevents WRITE_FAILED errors when the daemon kills the session
		// but React components are still mounted with active subscriptions.
		// The daemon will also emit an exit event; duplicates are harmless.
		const session = this.sessions.get(paneId);
		if (session?.isAlive) {
			session.isAlive = false;
			session.pid = null;
			this.emit(`exit:${paneId}`, 0, 15);
			this.emit("terminalExit", { paneId, exitCode: 0, signal: 15 });
		}

		// Unregister from port manager
		portManager.unregisterDaemonSession(paneId);

		// Close and optionally delete history
		if (deleteHistory && session) {
			await this.cleanupHistory(paneId, session.workspaceId);
		} else {
			this.closeHistoryWriter(paneId, 0);
		}

		await this.client.kill({ sessionId: paneId, deleteHistory });
	}

	detach(params: { paneId: string; viewportY?: number }): void {
		const { paneId, viewportY } = params;

		const session = this.sessions.get(paneId);

		// Fire and forget. Daemon detach is idempotent and succeeds even if the
		// session doesn't exist (prevents noisy races during startup/cold restore).
		this.client.detach({ sessionId: paneId }).catch((error) => {
			console.error(
				`[DaemonTerminalManager] Detach failed for ${paneId}:`,
				error,
			);
		});

		if (session) {
			session.lastActive = Date.now();
			if (viewportY !== undefined) {
				session.viewportY = viewportY;
			}
		}
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
				await writer.close().catch((error) => {
					console.warn(
						`[DaemonTerminalManager] Failed to close history writer for ${paneId}:`,
						error,
					);
				});
				this.historyWriters.delete(paneId);
				try {
					await this.initHistoryWriter(
						paneId,
						session.workspaceId,
						session.cwd,
						session.cols,
						session.rows,
						undefined,
					);
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
		const closePromises: Promise<void>[] = [];
		for (const [paneId, writer] of this.historyWriters.entries()) {
			closePromises.push(
				writer.close().catch((error) => {
					console.warn(
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

		const initPromises: Promise<void>[] = [];
		for (const [paneId, session] of this.sessions.entries()) {
			if (!session.isAlive) continue;
			initPromises.push(
				this.initHistoryWriter(
					paneId,
					session.workspaceId,
					session.cwd,
					session.cols,
					session.rows,
					undefined,
				).catch((error) => {
					console.warn(
						`[DaemonTerminalManager] Failed to reinitialize history for ${paneId}:`,
						error,
					);
				}),
			);
		}
		await Promise.all(initPromises);
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
				// Emit exit event BEFORE killing so the renderer can stop sending input.
				// This prevents WRITE_FAILED error toast floods when deleting workspaces.
				const session = this.sessions.get(paneId);
				if (session?.isAlive) {
					session.isAlive = false;
					session.pid = null;
					this.emit(`exit:${paneId}`, 0, 15);
					this.emit("terminalExit", { paneId, exitCode: 0, signal: 15 });
				}

				// Unregister from port manager
				portManager.unregisterDaemonSession(paneId);

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
				name.startsWith("error:") ||
				name === "terminalExit"
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
		// Clear pending cleanup timeouts to prevent callbacks after dispose
		for (const timeout of this.cleanupTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.cleanupTimeouts.clear();

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
		this.daemonAliveSessionIds.clear();
		this.daemonSessionIdsHydrated = false;
		this.coldRestoreInfo.clear();
		this.removeAllListeners();
		disposeTerminalHostClient();
	}

	/**
	 * Forcefully kill all sessions in the daemon.
	 * Only use this when you explicitly want to destroy all terminals,
	 * not during normal app shutdown.
	 */
	async forceKillAll(): Promise<void> {
		const response = await this.client.listSessions().catch(() => ({
			sessions: [],
		}));
		const sessionIds = response.sessions.map((s) => s.sessionId);

		// Clear pending cleanup timeouts to prevent callbacks after force kill.
		for (const timeout of this.cleanupTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.cleanupTimeouts.clear();

		// Close all history writers
		for (const writer of this.historyWriters.values()) {
			await writer.close().catch((error) => {
				console.warn(
					"[DaemonTerminalManager] Failed to close history writer during forceKillAll:",
					error,
				);
			});
		}
		this.historyWriters.clear();
		this.historyInitializing.clear();
		this.pendingHistoryData.clear();

		await this.client.killAll({});
		for (const paneId of sessionIds) {
			portManager.unregisterDaemonSession(paneId);
		}
		this.daemonAliveSessionIds.clear();
		this.daemonSessionIdsHydrated = true;
		this.coldRestoreInfo.clear();
		this.sessions.clear();
	}
}

// =============================================================================
// PrioritySemaphore (small custom concurrency limiter)
// =============================================================================

class PrioritySemaphore {
	private inUse = 0;
	private queue: Array<{
		priority: number;
		resolve: (release: () => void) => void;
	}> = [];

	constructor(private max: number) {}

	acquire(priority: number): Promise<() => void> {
		if (this.inUse < this.max) {
			this.inUse++;
			return Promise.resolve(() => this.release());
		}

		return new Promise<() => void>((resolve) => {
			this.queue.push({ priority, resolve });
			// Small N; simple sort is fine and keeps the implementation obvious.
			this.queue.sort((a, b) => a.priority - b.priority);
		});
	}

	private release(): void {
		this.inUse = Math.max(0, this.inUse - 1);
		this.pump();
	}

	private pump(): void {
		while (this.inUse < this.max && this.queue.length > 0) {
			const next = this.queue.shift();
			if (!next) return;
			this.inUse++;
			next.resolve(() => this.release());
		}
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
