import { EventEmitter } from "node:events";
import { FALLBACK_SHELL, SHELL_CRASH_THRESHOLD_MS } from "./env";
import {
	closeSessionHistory,
	createSession,
	flushSession,
	reinitializeHistory,
	setupDataHandler,
} from "./session";
import type {
	CreateSessionParams,
	InternalCreateSessionParams,
	SessionResult,
	TerminalSession,
} from "./types";

export class TerminalManager extends EventEmitter {
	private sessions = new Map<string, TerminalSession>();
	private pendingSessions = new Map<string, Promise<SessionResult>>();

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId, cols, rows } = params;

		// Deduplicate concurrent calls (prevents race in React Strict Mode)
		const pending = this.pendingSessions.get(paneId);
		if (pending) {
			return pending;
		}

		// Return existing session if alive
		const existing = this.sessions.get(paneId);
		if (existing?.isAlive) {
			existing.lastActive = Date.now();
			if (cols !== undefined && rows !== undefined) {
				this.resize({ paneId, cols, rows });
			}
			return {
				isNew: false,
				scrollback: existing.scrollback,
				wasRecovered: existing.wasRecovered,
			};
		}

		// Create new session
		const creationPromise = this.doCreateSession({
			...params,
			existingScrollback: existing?.scrollback || null,
		});
		this.pendingSessions.set(paneId, creationPromise);

		try {
			return await creationPromise;
		} finally {
			this.pendingSessions.delete(paneId);
		}
	}

	private async doCreateSession(
		params: InternalCreateSessionParams,
	): Promise<SessionResult> {
		const { paneId, initialCommands } = params;

		// Create the session
		const session = await createSession(params, (id, data) => {
			this.emit(`data:${id}`, data);
		});

		// Set up data handler
		setupDataHandler(session, initialCommands, session.wasRecovered, () =>
			reinitializeHistory(session),
		);

		// Set up exit handler with fallback logic
		this.setupExitHandler(session, params);

		this.sessions.set(paneId, session);

		return {
			isNew: true,
			scrollback: session.scrollback,
			wasRecovered: session.wasRecovered,
		};
	}

	private setupExitHandler(
		session: TerminalSession,
		params: InternalCreateSessionParams,
	): void {
		const { paneId } = params;

		session.pty.onExit(async ({ exitCode, signal }) => {
			session.isAlive = false;
			flushSession(session);

			// Check if shell crashed quickly - try fallback
			const sessionDuration = Date.now() - session.startTime;
			const crashedQuickly =
				sessionDuration < SHELL_CRASH_THRESHOLD_MS && exitCode !== 0;

			if (crashedQuickly && !session.usedFallback) {
				console.warn(
					`[TerminalManager] Shell "${session.shell}" exited with code ${exitCode} after ${sessionDuration}ms, retrying with fallback shell "${FALLBACK_SHELL}"`,
				);

				await closeSessionHistory(session, exitCode);
				this.sessions.delete(paneId);

				try {
					await this.doCreateSession({
						...params,
						existingScrollback: session.scrollback || null,
						useFallbackShell: true,
					});
					return; // Recovered - don't emit exit
				} catch (fallbackError) {
					console.error(
						"[TerminalManager] Fallback shell also failed:",
						fallbackError,
					);
				}
			}

			await closeSessionHistory(session, exitCode);
			this.emit(`exit:${paneId}`, exitCode, signal);

			// Clean up session after delay
			const timeout = setTimeout(() => {
				this.sessions.delete(paneId);
			}, 5000);
			timeout.unref();
		});
	}

	write(params: { paneId: string; data: string }): void {
		const { paneId, data } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			throw new Error(`Terminal session ${paneId} not found or not alive`);
		}

		session.pty.write(data);
		session.lastActive = Date.now();
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const { paneId, cols, rows } = params;

		// Validate geometry: cols and rows must be positive integers
		if (
			!Number.isInteger(cols) ||
			!Number.isInteger(rows) ||
			cols <= 0 ||
			rows <= 0
		) {
			console.warn(
				`[TerminalManager] Invalid resize geometry for ${paneId}: cols=${cols}, rows=${rows}. Must be positive integers.`,
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

		try {
			session.pty.resize(cols, rows);
			session.cols = cols;
			session.rows = rows;
			session.lastActive = Date.now();
		} catch (error) {
			console.error(
				`[TerminalManager] Failed to resize terminal ${paneId} (cols=${cols}, rows=${rows}):`,
				error,
			);
		}
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

		session.pty.kill(signal);
		session.lastActive = Date.now();
	}

	async kill(params: {
		paneId: string;
		deleteHistory?: boolean;
	}): Promise<void> {
		const { paneId, deleteHistory = false } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(`Cannot kill terminal ${paneId}: session not found`);
			return;
		}

		if (deleteHistory) {
			session.deleteHistoryOnExit = true;
		}

		if (session.isAlive) {
			session.pty.kill();
		} else {
			await closeSessionHistory(session);
			this.sessions.delete(paneId);
		}
	}

	detach(params: { paneId: string }): void {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(`Cannot detach terminal ${paneId}: session not found`);
			return;
		}

		session.lastActive = Date.now();
	}

	async clearScrollback(params: { paneId: string }): Promise<void> {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(
				`Cannot clear scrollback for terminal ${paneId}: session not found`,
			);
			return;
		}

		session.scrollback = "";
		await reinitializeHistory(session);
		session.lastActive = Date.now();
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
		const sessionsToKill = Array.from(this.sessions.entries()).filter(
			([, session]) => session.workspaceId === workspaceId,
		);

		if (sessionsToKill.length === 0) {
			return { killed: 0, failed: 0 };
		}

		const results = await Promise.all(
			sessionsToKill.map(([paneId, session]) =>
				this.killSessionWithTimeout(paneId, session),
			),
		);

		const killed = results.filter(Boolean).length;
		return { killed, failed: results.length - killed };
	}

	private async killSessionWithTimeout(
		paneId: string,
		session: TerminalSession,
	): Promise<boolean> {
		if (!session.isAlive) {
			session.deleteHistoryOnExit = true;
			await closeSessionHistory(session);
			this.sessions.delete(paneId);
			return true;
		}

		session.deleteHistoryOnExit = true;

		return new Promise<boolean>((resolve) => {
			let resolved = false;
			let sigtermTimeout: ReturnType<typeof setTimeout> | undefined;
			let sigkillTimeout: ReturnType<typeof setTimeout> | undefined;

			const cleanup = (success: boolean) => {
				if (resolved) return;
				resolved = true;
				this.off(`exit:${paneId}`, exitHandler);
				if (sigtermTimeout) clearTimeout(sigtermTimeout);
				if (sigkillTimeout) clearTimeout(sigkillTimeout);
				resolve(success);
			};

			const exitHandler = () => cleanup(true);
			this.once(`exit:${paneId}`, exitHandler);

			// Escalate to SIGKILL after 2s
			sigtermTimeout = setTimeout(() => {
				if (resolved || !session.isAlive) return;

				try {
					session.pty.kill("SIGKILL");
				} catch (error) {
					console.error(`Failed to send SIGKILL to terminal ${paneId}:`, error);
				}

				// Force cleanup after another 500ms
				sigkillTimeout = setTimeout(() => {
					if (resolved) return;
					if (session.isAlive) {
						console.error(
							`Terminal ${paneId} did not exit after SIGKILL, forcing cleanup`,
						);
						session.isAlive = false;
						this.sessions.delete(paneId);
						closeSessionHistory(session).catch(() => {});
					}
					cleanup(false);
				}, 500);
				sigkillTimeout.unref();
			}, 2000);
			sigtermTimeout.unref();

			// Send SIGTERM
			try {
				session.pty.kill();
			} catch (error) {
				console.error(`Failed to send SIGTERM to terminal ${paneId}:`, error);
				session.isAlive = false;
				this.sessions.delete(paneId);
				closeSessionHistory(session).catch(() => {});
				cleanup(false);
			}
		});
	}

	getSessionCountByWorkspaceId(workspaceId: string): number {
		return Array.from(this.sessions.values()).filter(
			(session) => session.workspaceId === workspaceId && session.isAlive,
		).length;
	}

	detachAllListeners(): void {
		for (const event of this.eventNames()) {
			const name = String(event);
			if (name.startsWith("data:") || name.startsWith("exit:")) {
				this.removeAllListeners(event);
			}
		}
	}

	async cleanup(): Promise<void> {
		const exitPromises: Promise<void>[] = [];

		for (const [paneId, session] of this.sessions.entries()) {
			if (session.isAlive) {
				const exitPromise = new Promise<void>((resolve) => {
					let timeoutId: ReturnType<typeof setTimeout> | undefined;
					const exitHandler = () => {
						this.off(`exit:${paneId}`, exitHandler);
						if (timeoutId !== undefined) {
							clearTimeout(timeoutId);
						}
						resolve();
					};
					this.once(`exit:${paneId}`, exitHandler);

					timeoutId = setTimeout(() => {
						this.off(`exit:${paneId}`, exitHandler);
						resolve();
					}, 2000);
					timeoutId.unref();
				});

				exitPromises.push(exitPromise);
				session.pty.kill();
			} else {
				await closeSessionHistory(session);
			}
		}

		await Promise.all(exitPromises);
		this.sessions.clear();
		this.removeAllListeners();
	}
}

/** Singleton terminal manager instance */
export const terminalManager = new TerminalManager();
