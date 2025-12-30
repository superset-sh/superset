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

export class TerminalHost {
	private sessions: Map<string, Session> = new Map();

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

			// Run initial commands if provided
			if (request.initialCommands && request.initialCommands.length > 0) {
				// Wait a bit for shell to initialize, then run commands
				setTimeout(() => {
					if (session?.isAlive) {
						const cmdString = `${request.initialCommands?.join(" && ")}\n`;
						session.write(cmdString);
					}
				}, 100);
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
	 * Write data to a terminal session
	 */
	write(request: WriteRequest): EmptyResponse {
		const session = this.getSession(request.sessionId);
		session.write(request.data);
		return { success: true };
	}

	/**
	 * Resize a terminal session
	 */
	resize(request: ResizeRequest): EmptyResponse {
		const session = this.getSession(request.sessionId);
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
	 * Kill a terminal session
	 */
	kill(request: KillRequest): EmptyResponse {
		const session = this.sessions.get(request.sessionId);
		if (session) {
			session.kill();
			// Session will be removed on exit event
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
	 * List all sessions
	 */
	listSessions(): ListSessionsResponse {
		const sessions = Array.from(this.sessions.values()).map((session) => ({
			sessionId: session.sessionId,
			workspaceId: session.workspaceId,
			paneId: session.paneId,
			isAlive: session.isAlive,
			attachedClients: session.clientCount,
		}));

		return { sessions };
	}

	/**
	 * Clear scrollback for a session
	 */
	clearScrollback(request: ClearScrollbackRequest): EmptyResponse {
		const session = this.getSession(request.sessionId);
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
	 * Handle session exit
	 */
	private handleSessionExit(
		sessionId: string,
		_exitCode: number,
		_signal?: number,
	): void {
		// Keep session around for a bit so clients can see exit status
		// Then clean up (reschedule if clients still attached)
		this.scheduleSessionCleanup(sessionId);
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
