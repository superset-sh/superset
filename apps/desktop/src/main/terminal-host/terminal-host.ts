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
	SignalRequest,
	WriteRequest,
} from "../lib/terminal-host/types";
import { createSession, type Session } from "./session";

// =============================================================================
// TerminalHost Class
// =============================================================================

/** Timeout for force-disposing sessions that don't exit after kill */
const KILL_TIMEOUT_MS = 5000;
const MAX_CONCURRENT_SPAWNS = 3;
const SPAWN_READY_TIMEOUT_MS = 5000;

function promiseWithTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error(`Timeout after ${timeoutMs}ms`));
		}, timeoutMs);

		promise
			.then((value) => {
				clearTimeout(timeoutId);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timeoutId);
				reject(error);
			});
	});
}

export class TerminalHost {
	private sessions: Map<string, Session> = new Map();
	private killTimers: Map<string, NodeJS.Timeout> = new Map();
	private spawnLimiter = new Semaphore(MAX_CONCURRENT_SPAWNS);
	private onUnattachedExit?: (event: {
		sessionId: string;
		exitCode: number;
		signal?: number;
	}) => void;

	constructor({
		onUnattachedExit,
	}: {
		onUnattachedExit?: (event: {
			sessionId: string;
			exitCode: number;
			signal?: number;
		}) => void;
	} = {}) {
		this.onUnattachedExit = onUnattachedExit;
	}

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
			const releaseSpawn = await this.spawnLimiter.acquire();

			// Create new session
			try {
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

				// Hold the spawn permit until the PTY is ready (or times out). This spreads
				// out large bursts of session creation and avoids CPU spikes from dozens
				// of shells starting simultaneously.
				void promiseWithTimeout(session.waitForReady(), SPAWN_READY_TIMEOUT_MS)
					.catch(() => {})
					.finally(() => {
						releaseSpawn();
					});
			} catch (error) {
				releaseSpawn();
				throw error;
			}

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
			pid: session.pid,
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
	 * No-op if session is not found or is terminating (prevents race condition errors).
	 */
	resize(request: ResizeRequest): EmptyResponse {
		const session = this.sessions.get(request.sessionId);
		// Silently succeed if session doesn't exist or is terminating
		// This prevents noisy errors during kill/reconciliation races
		if (!session || !session.isAttachable) {
			return { success: true };
		}
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
	 * Send a signal to a terminal session (e.g., SIGINT for Ctrl+C).
	 * Unlike kill, this does NOT mark the session as terminating.
	 */
	signal(request: SignalRequest): EmptyResponse {
		const { sessionId, signal } = request;
		const session = this.sessions.get(sessionId);

		if (!session || !session.isAttachable) {
			return { success: true };
		}

		session.sendSignal(signal);
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
		const sessions = Array.from(this.sessions.values()).map((session) => {
			const meta = session.getMeta();
			return {
				sessionId: session.sessionId,
				workspaceId: session.workspaceId,
				paneId: session.paneId,
				isAlive: session.isAttachable, // Use isAttachable to prevent kill/attach races
				attachedClients: session.clientCount,
				pid: session.pid,
				createdAt: meta.createdAt,
				lastAttachedAt: meta.lastAttachedAt,
				shell: meta.shell,
			};
		});

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
		exitCode: number,
		signal?: number,
	): void {
		// Clear the kill timer since session exited normally
		this.clearKillTimer(sessionId);

		// If no clients are attached, the session won't have anywhere to deliver the
		// exit event. Emit a low-volume lifecycle signal so the main process can keep
		// UI state correct even when a terminal isn't actively streamed.
		const session = this.sessions.get(sessionId);
		if (session?.clientCount === 0) {
			this.onUnattachedExit?.({ sessionId, exitCode, signal });
		}

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

class Semaphore {
	private inUse = 0;
	private queue: Array<(release: () => void) => void> = [];

	constructor(private max: number) {}

	acquire(): Promise<() => void> {
		if (this.inUse < this.max) {
			this.inUse++;
			return Promise.resolve(() => this.release());
		}

		return new Promise<() => void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	private release(): void {
		this.inUse = Math.max(0, this.inUse - 1);

		const next = this.queue.shift();
		if (next) {
			this.inUse++;
			next(() => this.release());
		}
	}
}
