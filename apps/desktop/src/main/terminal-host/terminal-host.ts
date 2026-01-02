/**
 * Terminal Host Manager
 *
 * Manages all terminal sessions in the daemon.
 * Responsible for:
 * - Session lifecycle (create, attach, detach, kill)
 * - Session lookup and listing
 * - Cleanup on shutdown
 */

import type { Socket } from "node:net";
import type {
	ClearScrollbackRequest,
	CreateOrAttachRequest,
	CreateOrAttachResponse,
	DetachRequest,
	EmptyResponse,
	KillAllRequest,
	KillRequest,
	ListSessionsResponse,
	ResizeRequest,
	WriteRequest,
} from "../lib/terminal-host/types";
import { createSession, type Session } from "./session";

// =============================================================================
// TerminalHost Class
// =============================================================================

/** Timeout for force-disposing sessions that don't exit after kill */
const KILL_TIMEOUT_MS = 5000;

export class TerminalHost {
	private sessions: Map<string, Session> = new Map();
	private killTimers: Map<string, NodeJS.Timeout> = new Map();

	/**
	 * Create or attach to a terminal session
	 */
	async createOrAttach(
		socket: Socket,
		request: CreateOrAttachRequest,
	): Promise<CreateOrAttachResponse> {
		const { sessionId } = request;

		let session = this.sessions.get(sessionId);
		let isNew = false;

		// If session is terminating (kill was called but PTY hasn't exited yet),
		// force-dispose it and create a fresh session. This prevents race conditions
		// where createOrAttach is called immediately after kill.
		if (session?.isTerminating) {
			console.log(
				`[TerminalHost] Session ${sessionId} is terminating, force-disposing for fresh start`,
			);
			session.dispose();
			this.sessions.delete(sessionId);
			this.clearKillTimer(sessionId);
			session = undefined;
		}

		// If session exists but is dead, dispose it and create a new one
		if (session && !session.isAlive) {
			session.dispose();
			this.sessions.delete(sessionId);
			session = undefined;
		}

		if (!session) {
			// Create new session
			session = createSession(request);

			// Set up exit handler
			session.onExit((id, exitCode, signal) => {
				this.handleSessionExit(id, exitCode, signal);
			});

			// Spawn PTY
			session.spawn({
				cwd: request.cwd || process.env.HOME || "/",
				cols: request.cols,
				rows: request.rows,
				env: request.env,
			});

			// Run initial commands if provided (after PTY is ready)
			if (request.initialCommands && request.initialCommands.length > 0) {
				const initialCommands = request.initialCommands;
				// Wait for PTY to be ready, then run commands
				session.waitForReady().then(() => {
					// Double-check session is still alive after await
					if (session?.isAlive) {
						try {
							const cmdString = `${initialCommands.join(" && ")}\n`;
							session.write(cmdString);
						} catch (error) {
							// Log but don't crash - initialCommands are best-effort
							console.error(
								`[TerminalHost] Failed to run initial commands for ${sessionId}:`,
								error,
							);
						}
					}
				});
			}

			this.sessions.set(sessionId, session);
			isNew = true;
		} else {
			// Attaching to existing live session - resize to requested dimensions
			// This ensures the snapshot reflects the client's current terminal size
			// Note: Resize can fail if PTY is in a bad state (e.g., EBADF)
			// We catch and ignore these errors since the session may still be usable
			try {
				session.resize(request.cols, request.rows);
			} catch {
				// Ignore resize failures - session may still be attachable
			}
		}

		// Attach client to session (async to ensure pending writes are flushed)
		const snapshot = await session.attach(socket);

		return {
			isNew,
			snapshot,
			wasRecovered: !isNew && session.isAlive,
		};
	}

	/**
	 * Write data to a terminal session.
	 * Throws if session is not found or is terminating.
	 */
	write(request: WriteRequest): EmptyResponse {
		const session = this.getActiveSession(request.sessionId);
		session.write(request.data);
		return { success: true };
	}

	/**
	 * Resize a terminal session.
	 * Throws if session is not found or is terminating.
	 */
	resize(request: ResizeRequest): EmptyResponse {
		const session = this.getActiveSession(request.sessionId);
		session.resize(request.cols, request.rows);
		return { success: true };
	}

	/**
	 * Detach a client from a session
	 */
	detach(socket: Socket, request: DetachRequest): EmptyResponse {
		const session = this.sessions.get(request.sessionId);
		if (session) {
			session.detach(socket);
			// Clean up dead sessions when last client detaches
			if (!session.isAlive && session.clientCount === 0) {
				session.dispose();
				this.sessions.delete(request.sessionId);
			}
		}
		return { success: true };
	}

	/**
	 * Kill a terminal session.
	 * The session is marked as terminating immediately (non-attachable).
	 * A fail-safe timer ensures cleanup even if the PTY never exits.
	 */
	kill(request: KillRequest): EmptyResponse {
		const { sessionId } = request;
		const session = this.sessions.get(sessionId);

		if (!session) {
			return { success: true };
		}

		session.kill();

		// Set up fail-safe timer to force-dispose if exit never fires.
		// This prevents zombie sessions if the PTY process hangs.
		if (!this.killTimers.has(sessionId)) {
			const timer = setTimeout(() => {
				const s = this.sessions.get(sessionId);
				if (s?.isTerminating) {
					console.warn(
						`[TerminalHost] Force disposing stuck session ${sessionId} after ${KILL_TIMEOUT_MS}ms`,
					);
					s.dispose();
					this.sessions.delete(sessionId);
				}
				this.killTimers.delete(sessionId);
			}, KILL_TIMEOUT_MS);
			this.killTimers.set(sessionId, timer);
		}

		return { success: true };
	}

	/**
	 * Kill all terminal sessions
	 */
	killAll(_request: KillAllRequest): EmptyResponse {
		for (const session of this.sessions.values()) {
			session.kill();
		}
		// Sessions will be removed on exit events
		return { success: true };
	}

	/**
	 * List all sessions.
	 * Note: isAlive reports isAttachable (alive AND not terminating) to prevent
	 * race conditions where killByWorkspaceId sees a session as alive while
	 * it's actually in the process of being killed.
	 */
	listSessions(): ListSessionsResponse {
		const sessions = Array.from(this.sessions.values()).map((session) => ({
			sessionId: session.sessionId,
			workspaceId: session.workspaceId,
			paneId: session.paneId,
			isAlive: session.isAttachable, // Use isAttachable to prevent kill/attach races
			attachedClients: session.clientCount,
		}));

		return { sessions };
	}

	/**
	 * Clear scrollback for a session.
	 * Throws if session is not found or is terminating.
	 */
	clearScrollback(request: ClearScrollbackRequest): EmptyResponse {
		const session = this.getActiveSession(request.sessionId);
		session.clearScrollback();
		return { success: true };
	}

	/**
	 * Detach a socket from all sessions it's attached to
	 * Called when a client connection closes
	 */
	detachFromAllSessions(socket: Socket): void {
		for (const [sessionId, session] of this.sessions.entries()) {
			session.detach(socket);
			// Clean up dead sessions when last client detaches
			if (!session.isAlive && session.clientCount === 0) {
				session.dispose();
				this.sessions.delete(sessionId);
			}
		}
	}

	/**
	 * Clean up all sessions on shutdown
	 */
	dispose(): void {
		// Clear all kill timers
		for (const timer of this.killTimers.values()) {
			clearTimeout(timer);
		}
		this.killTimers.clear();

		// Dispose all sessions
		for (const session of this.sessions.values()) {
			session.dispose();
		}
		this.sessions.clear();
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Get a session by ID, throw if not found
	 */
	private getSession(sessionId: string): Session {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session not found: ${sessionId}`);
		}
		return session;
	}

	/**
	 * Get an active (attachable) session by ID.
	 * Throws if session doesn't exist or is terminating.
	 * Use this for mutating operations (write, resize, clearScrollback).
	 */
	private getActiveSession(sessionId: string): Session {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session not found: ${sessionId}`);
		}
		if (!session.isAttachable) {
			throw new Error(`Session not attachable: ${sessionId}`);
		}
		return session;
	}

	/**
	 * Handle session exit
	 */
	private handleSessionExit(
		sessionId: string,
		_exitCode: number,
		_signal?: number,
	): void {
		// Clear the kill timer since session exited normally
		this.clearKillTimer(sessionId);

		// Keep session around for a bit so clients can see exit status
		// Then clean up (reschedule if clients still attached)
		this.scheduleSessionCleanup(sessionId);
	}

	/**
	 * Clear the kill timeout for a session
	 */
	private clearKillTimer(sessionId: string): void {
		const timer = this.killTimers.get(sessionId);
		if (timer) {
			clearTimeout(timer);
			this.killTimers.delete(sessionId);
		}
	}

	/**
	 * Schedule cleanup of a dead session
	 * Reschedules if clients are still attached
	 */
	private scheduleSessionCleanup(sessionId: string): void {
		setTimeout(() => {
			const session = this.sessions.get(sessionId);
			if (!session || session.isAlive) {
				// Session was recreated or is alive, nothing to clean up
				return;
			}

			if (session.clientCount === 0) {
				// No clients attached, safe to clean up
				session.dispose();
				this.sessions.delete(sessionId);
			} else {
				// Clients still attached, reschedule cleanup
				// They'll see the exit status and can restart
				this.scheduleSessionCleanup(sessionId);
			}
		}, 5000);
	}
}
