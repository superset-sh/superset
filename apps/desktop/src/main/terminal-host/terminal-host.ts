import type { Socket } from "node:net";
import { TerminalAttachCanceledError } from "../lib/terminal/errors";
import type {
	CancelCreateOrAttachRequest,
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

const KILL_TIMEOUT_MS = 5000;
const MAX_CONCURRENT_SPAWNS = 3;
const SPAWN_READY_TIMEOUT_MS = 5000;

interface PendingAttach {
	requestId: string;
	abortController: AbortController;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new TerminalAttachCanceledError();
	}
}

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
	private pendingAttaches: Map<string, PendingAttach> = new Map();
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

	async createOrAttach(
		socket: Socket,
		request: CreateOrAttachRequest,
	): Promise<CreateOrAttachResponse> {
		const { sessionId } = request;
		const requestId = request.requestId ?? `${sessionId}:${Date.now()}`;
		const existingPending = this.pendingAttaches.get(sessionId);
		if (existingPending && existingPending.requestId !== requestId) {
			existingPending.abortController.abort();
		}
		const pendingAttach: PendingAttach = {
			requestId,
			abortController: new AbortController(),
		};
		this.pendingAttaches.set(sessionId, pendingAttach);

		let session = this.sessions.get(sessionId);
		let isNew = false;
		let shouldDisposeIfCanceled = false;

		try {
			// Force-dispose terminating sessions to prevent race conditions
			if (session?.isTerminating) {
				void session.dispose();
				this.sessions.delete(sessionId);
				this.clearKillTimer(sessionId);
				session = undefined;
			}

			if (session && !session.isAlive) {
				void session.dispose();
				this.sessions.delete(sessionId);
				session = undefined;
			}

			if (!session) {
				const releaseSpawn = await this.spawnLimiter.acquire(
					pendingAttach.abortController.signal,
				);
				let spawnReleased = false;
				const releaseSpawnOnce = () => {
					if (spawnReleased) return;
					spawnReleased = true;
					releaseSpawn();
				};

				try {
					throwIfAborted(pendingAttach.abortController.signal);
					session = createSession(request);
					shouldDisposeIfCanceled = true;

					session.onExit((id, exitCode, signal) => {
						this.handleSessionExit(id, exitCode, signal);
					});

					session.spawn({
						cwd: request.cwd || process.env.HOME || "/",
						cols: request.cols,
						rows: request.rows,
						env: request.env,
					});

					try {
						await promiseWithTimeout(
							session.waitForReady(),
							SPAWN_READY_TIMEOUT_MS,
						);
					} catch {
						console.warn(
							`[TerminalHost] Timeout waiting for PTY ready for session ${sessionId}`,
						);
					} finally {
						releaseSpawnOnce();
					}
				} catch (error) {
					releaseSpawnOnce();
					throw error;
				}

				throwIfAborted(pendingAttach.abortController.signal);

				if (!session.isAlive || session.pid === null) {
					void session.dispose();
					throw new Error(
						"Session spawn failed: PTY process exited immediately",
					);
				}

				this.sessions.set(sessionId, session);
				isNew = true;
			} else {
				// Resize to client dimensions - failures are non-fatal
				try {
					session.resize(request.cols, request.rows);
				} catch {
					// Ignore - session may still be attachable
				}
			}

			const snapshot = await session.attach(
				socket,
				pendingAttach.abortController.signal,
			);

			return {
				isNew,
				snapshot,
				wasRecovered: !isNew && session.isAlive,
				pid: session.pid,
			};
		} catch (error) {
			if (
				error instanceof TerminalAttachCanceledError &&
				shouldDisposeIfCanceled &&
				session &&
				session.clientCount === 0
			) {
				void session.dispose();
				this.sessions.delete(sessionId);
			}
			throw error;
		} finally {
			if (this.pendingAttaches.get(sessionId) === pendingAttach) {
				this.pendingAttaches.delete(sessionId);
			}
		}
	}

	cancelCreateOrAttach(request: CancelCreateOrAttachRequest): EmptyResponse {
		const pendingAttach = this.pendingAttaches.get(request.sessionId);
		if (!pendingAttach || pendingAttach.requestId !== request.requestId) {
			return { success: true };
		}
		pendingAttach.abortController.abort();
		if (this.pendingAttaches.get(request.sessionId) === pendingAttach) {
			this.pendingAttaches.delete(request.sessionId);
		}
		return { success: true };
	}

	write(request: WriteRequest): EmptyResponse {
		const session = this.getActiveSession(request.sessionId);
		session.write(request.data);
		return { success: true };
	}

	resize(request: ResizeRequest): EmptyResponse {
		const session = this.sessions.get(request.sessionId);
		if (!session || !session.isAttachable) {
			return { success: true };
		}
		session.resize(request.cols, request.rows);
		return { success: true };
	}

	detach(socket: Socket, request: DetachRequest): EmptyResponse {
		const session = this.sessions.get(request.sessionId);
		if (session) {
			session.detach(socket);
			if (!session.isAlive && session.clientCount === 0) {
				void session.dispose();
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

		// Fail-safe timer to force-dispose if PTY hangs
		if (!this.killTimers.has(sessionId)) {
			const timer = setTimeout(() => {
				const s = this.sessions.get(sessionId);
				if (s?.isTerminating) {
					console.warn(
						`[TerminalHost] Force disposing stuck session ${sessionId} after ${KILL_TIMEOUT_MS}ms`,
					);
					void s.dispose();
					this.sessions.delete(sessionId);
				}
				this.killTimers.delete(sessionId);
			}, KILL_TIMEOUT_MS);
			this.killTimers.set(sessionId, timer);
		}

		return { success: true };
	}

	killAll(request: KillAllRequest): EmptyResponse {
		for (const session of this.sessions.values()) {
			this.kill({
				sessionId: session.sessionId,
				deleteHistory: request.deleteHistory,
			});
		}
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
				void session.dispose();
				this.sessions.delete(sessionId);
			}
		}
	}

	async dispose(): Promise<void> {
		for (const pendingAttach of this.pendingAttaches.values()) {
			pendingAttach.abortController.abort();
		}
		this.pendingAttaches.clear();

		for (const timer of this.killTimers.values()) {
			clearTimeout(timer);
		}
		this.killTimers.clear();

		const sessions = [...this.sessions.values()];
		this.sessions.clear();

		if (sessions.length === 0) return;

		await Promise.race([
			Promise.all(sessions.map((s) => s.dispose())),
			new Promise<void>((resolve) => setTimeout(resolve, 5000)),
		]);
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

	private handleSessionExit(
		sessionId: string,
		exitCode: number,
		signal?: number,
	): void {
		this.clearKillTimer(sessionId);

		const session = this.sessions.get(sessionId);
		if (session?.clientCount === 0) {
			this.onUnattachedExit?.({ sessionId, exitCode, signal });
		}

		this.scheduleSessionCleanup(sessionId);
	}

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
				return;
			}

			if (session.clientCount === 0) {
				void session.dispose();
				this.sessions.delete(sessionId);
			} else {
				this.scheduleSessionCleanup(sessionId);
			}
		}, 5000);
	}
}

class Semaphore {
	private inUse = 0;
	private queue: Array<{
		resolve: (release: () => void) => void;
		reject: (error: Error) => void;
		signal?: AbortSignal;
		onAbort?: () => void;
	}> = [];

	constructor(private max: number) {}

	acquire(signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted) {
			return Promise.reject(new TerminalAttachCanceledError());
		}

		if (this.inUse < this.max) {
			this.inUse++;
			return Promise.resolve(() => this.release());
		}

		return new Promise<() => void>((resolve, reject) => {
			const waiter = { resolve, reject, signal } as {
				resolve: (release: () => void) => void;
				reject: (error: Error) => void;
				signal?: AbortSignal;
				onAbort?: () => void;
			};
			if (signal) {
				waiter.onAbort = () => {
					const index = this.queue.indexOf(waiter);
					if (index === -1) return;
					this.queue.splice(index, 1);
					waiter.reject(new TerminalAttachCanceledError());
				};
				signal.addEventListener("abort", waiter.onAbort, { once: true });
			}
			this.queue.push(waiter);
		});
	}

	private release(): void {
		this.inUse = Math.max(0, this.inUse - 1);

		const next = this.queue.shift();
		if (next) {
			if (next.onAbort && next.signal) {
				next.signal.removeEventListener("abort", next.onAbort);
			}
			if (next.signal?.aborted) {
				next.reject(new TerminalAttachCanceledError());
				this.release();
				return;
			}
			this.inUse++;
			next.resolve(() => this.release());
		}
	}
}
