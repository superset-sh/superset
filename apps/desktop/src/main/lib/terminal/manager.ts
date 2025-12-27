import { EventEmitter } from "node:events";
import os from "node:os";
import { track } from "main/lib/analytics";
import { HistoryReader, HistoryWriter } from "../terminal-history";
import {
	buildTerminalEnv,
	FALLBACK_SHELL,
	getDefaultShell,
	SHELL_CRASH_THRESHOLD_MS,
} from "./env";
import { getSessionName, processPersistence } from "./persistence/manager";
import { portManager } from "./port-manager";
import {
	closeSessionHistory,
	closeSessionHistoryForDetach,
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
		const { paneId, cols, rows, workspaceId } = params;

		const pending = this.pendingSessions.get(paneId);
		if (pending) {
			return pending;
		}

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

		const creationPromise = this.doCreateOrAttachPersistent(params, existing);
		this.pendingSessions.set(paneId, creationPromise);

		try {
			return await creationPromise;
		} finally {
			this.pendingSessions.delete(paneId);
		}
	}

	private async doCreateOrAttachPersistent(
		params: CreateSessionParams,
		existing: TerminalSession | undefined,
	): Promise<SessionResult> {
		const { paneId, workspaceId } = params;
		const sessionName = getSessionName(workspaceId, paneId);

		if (processPersistence.enabled) {
			try {
				if (await processPersistence.sessionExists(sessionName)) {
					const backendScrollback =
						await this.captureScrollbackBounded(sessionName);
					const ptyProcess =
						await processPersistence.attachSession(sessionName);

					return this.setupPersistentSession(ptyProcess, params, {
						scrollback: backendScrollback,
						wasRecovered: true,
						isPersistentBackend: true,
					});
				}
			} catch (error) {
				console.warn("[TerminalManager] Failed to attach:", error);

				try {
					await processPersistence.killSession(sessionName);
					console.log(
						"[TerminalManager] Killed orphaned session:",
						sessionName,
					);
				} catch {
					// Session may have already died
				}
			}

			try {
				await processPersistence.createSession({
					name: sessionName,
					cwd: params.cwd ?? os.homedir(),
					shell: getDefaultShell(),
					env: buildTerminalEnv({
						shell: getDefaultShell(),
						paneId: params.paneId,
						tabId: params.tabId,
						workspaceId: params.workspaceId,
						workspaceName: params.workspaceName,
						workspacePath: params.workspacePath,
						rootPath: params.rootPath,
					}),
				});
				const ptyProcess = await processPersistence.attachSession(sessionName);
				return this.setupPersistentSession(ptyProcess, params, {
					scrollback: "",
					wasRecovered: false,
					isPersistentBackend: true,
				});
			} catch (error) {
				console.warn(
					"[TerminalManager] Persistence failed, falling back:",
					error,
				);
			}
		}

		return this.doCreateSession({
			...params,
			existingScrollback: existing?.scrollback || null,
		});
	}

	private async captureScrollbackBounded(sessionName: string): Promise<string> {
		const MAX_SCROLLBACK_CHARS = 500_000;
		try {
			const scrollback = await Promise.race([
				processPersistence.captureScrollback(sessionName),
				new Promise<string>((_, reject) =>
					setTimeout(() => reject(new Error("timeout")), 2000),
				),
			]);
			return scrollback.length > MAX_SCROLLBACK_CHARS
				? scrollback.slice(-MAX_SCROLLBACK_CHARS)
				: scrollback;
		} catch {
			return "";
		}
	}

	private async setupPersistentSession(
		ptyProcess: import("node-pty").IPty,
		params: CreateSessionParams,
		opts: {
			scrollback: string;
			wasRecovered: boolean;
			isPersistentBackend: boolean;
		},
	): Promise<SessionResult> {
		const { paneId, workspaceId, initialCommands } = params;

		// Read saved CWD from metadata as fallback (in case tmux crashed previously)
		const historyReader = new HistoryReader(workspaceId, paneId);
		const savedMetadata = await historyReader.readMetadata();
		const cwd = params.cwd ?? savedMetadata?.cwd ?? os.homedir();
		const cols = params.cols ?? 80;
		const rows = params.rows ?? 24;

		// Create historyWriter for CWD tracking and backup scrollback persistence
		// Even for tmux sessions, this provides resilience if tmux crashes
		const historyWriter = new HistoryWriter(
			workspaceId,
			paneId,
			cwd,
			cols,
			rows,
		);
		await historyWriter.init(opts.scrollback || undefined);

		const session: TerminalSession = {
			pty: ptyProcess,
			paneId,
			workspaceId,
			cwd,
			cols,
			rows,
			lastActive: Date.now(),
			scrollback: opts.scrollback,
			isAlive: true,
			wasRecovered: opts.wasRecovered,
			dataBatcher: new (await import("../data-batcher")).DataBatcher((data) => {
				this.emit(`data:${paneId}`, data);
			}),
			shell: getDefaultShell(),
			startTime: Date.now(),
			usedFallback: false,
			isPersistentBackend: opts.isPersistentBackend,
			historyWriter,
		};

		setupDataHandler(session, initialCommands, opts.wasRecovered, () =>
			reinitializeHistory(session),
		);

		this.setupExitHandler(session, {
			...params,
			existingScrollback: opts.scrollback || null,
		});

		this.sessions.set(paneId, session);

		track("terminal_opened", { workspace_id: workspaceId, pane_id: paneId });

		return {
			isNew: true,
			scrollback: opts.scrollback,
			wasRecovered: opts.wasRecovered,
		};
	}

	private async doCreateSession(
		params: InternalCreateSessionParams,
	): Promise<SessionResult> {
		const { paneId, workspaceId, initialCommands } = params;

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

		// Track terminal opened (only fires once per session creation)
		track("terminal_opened", { workspace_id: workspaceId, pane_id: paneId });

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

			if (session.isPersistentBackend && session.isExpectedDetach) {
				return;
			}

			if (session.isPersistentBackend) {
				await closeSessionHistory(session, exitCode);
				portManager.removePortsForPane(paneId);
				this.emit(`exit:${paneId}`, exitCode, signal);
				return;
			}

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
					return;
				} catch (fallbackError) {
					console.error(
						"[TerminalManager] Fallback shell also failed:",
						fallbackError,
					);
				}
			}

			await closeSessionHistory(session, exitCode);

			portManager.removePortsForPane(paneId);

			this.emit(`exit:${paneId}`, exitCode, signal);

			session.cleanupTimeout = setTimeout(() => {
				this.sessions.delete(paneId);
			}, 5000);
			session.cleanupTimeout.unref();
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

		if (session.isPersistentBackend) {
			const sessionName = getSessionName(session.workspaceId, paneId);
			await processPersistence.killSession(sessionName).catch(() => {});
		}

		if (session.isAlive) {
			session.pty.kill();
		} else {
			await closeSessionHistory(session);
			this.sessions.delete(paneId);
		}
	}

	async detach(params: { paneId: string }): Promise<void> {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(`Cannot detach terminal ${paneId}: session not found`);
			return;
		}

		if (session.isPersistentBackend && session.isAlive) {
			if (session.cleanupTimeout) {
				clearTimeout(session.cleanupTimeout);
				session.cleanupTimeout = undefined;
			}

			session.isExpectedDetach = true;
			await closeSessionHistoryForDetach(session);
			session.pty.kill();
			this.sessions.delete(paneId);
		} else {
			session.lastActive = Date.now();
		}
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
			await processPersistence.killByWorkspace(workspaceId);
			return { killed: 0, failed: 0 };
		}

		const results = await Promise.all(
			sessionsToKill.map(([paneId, session]) =>
				this.killSessionWithTimeout(paneId, session),
			),
		);

		await processPersistence.killByWorkspace(workspaceId);

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

	/**
	 * Send a newline to all terminals in a workspace to refresh their prompts.
	 * Useful after switching branches to update the branch name in prompts.
	 */
	refreshPromptsForWorkspace(workspaceId: string): void {
		for (const [paneId, session] of this.sessions.entries()) {
			if (session.workspaceId === workspaceId && session.isAlive) {
				try {
					session.pty.write("\n");
				} catch (error) {
					console.warn(
						`[TerminalManager] Failed to refresh prompt for pane ${paneId}:`,
						error,
					);
				}
			}
		}
	}

	detachAllListeners(): void {
		for (const event of this.eventNames()) {
			const name = String(event);
			if (name.startsWith("data:") || name.startsWith("exit:")) {
				this.removeAllListeners(event);
			}
		}
	}

	async detachAll(): Promise<void> {
		for (const [paneId, session] of this.sessions.entries()) {
			if (session.isPersistentBackend && session.isAlive) {
				session.isExpectedDetach = true;
				await closeSessionHistoryForDetach(session);
				session.pty.kill();
			} else {
				await this.kill({ paneId });
			}
		}
		this.sessions.clear();
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
