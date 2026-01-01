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

		console.log(
			`[DaemonTerminalManager] createOrAttach called for paneId: ${paneId}`,
		);

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
		console.log(
			`[DaemonTerminalManager] Calling daemon createOrAttach with sessionId: ${paneId}`,
		);
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

		console.log(
			`[DaemonTerminalManager] Daemon response: isNew=${response.isNew}, wasRecovered=${response.wasRecovered}`,
		);

		// Track session locally
		this.sessions.set(paneId, {
			paneId,
			workspaceId,
			isAlive: true,
			lastActive: Date.now(),
			cwd: response.snapshot.cwd || cwd || "",
		});

		// Track terminal opened
		if (response.isNew) {
			track("terminal_opened", { workspace_id: workspaceId, pane_id: paneId });
		}

		return {
			isNew: response.isNew,
			// For backwards compatibility, provide scrollback from snapshot
			scrollback: response.snapshot.snapshotAnsi,
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

		session.lastActive = Date.now();
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

		await this.client.kill({ sessionId: paneId, deleteHistory });

		const session = this.sessions.get(paneId);
		if (session) {
			session.isAlive = false;
		}
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

		let killed = 0;
		let failed = 0;

		for (const paneId of paneIdsToKill) {
			try {
				await this.client.kill({ sessionId: paneId, deleteHistory: true });
				// Clean up local state if it exists
				const session = this.sessions.get(paneId);
				if (session) {
					session.isAlive = false;
				}
				killed++;
			} catch {
				failed++;
			}
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
	 */
	async cleanup(): Promise<void> {
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
