import { EventEmitter } from "node:events";
import os from "node:os";
import { track } from "main/lib/analytics";
import { HistoryReader, HistoryWriter } from "../terminal-history";
import { parseCwd } from "shared/parse-cwd";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../terminal-escape-filter";
import {
	buildTerminalEnv,
	FALLBACK_SHELL,
	getDefaultShell,
	SHELL_CRASH_THRESHOLD_MS,
} from "./env";
import {
	getSessionName,
	processPersistence,
	TmuxBackend,
} from "./persistence/manager";
import {
	SessionLifecycle,
	type SessionLifecycleEvents,
} from "./persistence/session-lifecycle";
import type { SessionState, TmuxError } from "./persistence/types";
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

const OSC7_BUFFER_SIZE = 4096;

export class TerminalManager extends EventEmitter {
	private sessions = new Map<string, TerminalSession>();
	private pendingSessions = new Map<string, Promise<SessionResult>>();
	private lifecycles = new Map<string, SessionLifecycle>();
	private tmuxBackend = new TmuxBackend();
	private osc7Buffers = new Map<string, string>();

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId, cols, rows, workspaceId } = params;

		const pending = this.pendingSessions.get(paneId);
		if (pending) {
			return pending;
		}

		const existing = this.sessions.get(paneId);
		if (existing?.isAlive) {
			const lifecycle = this.lifecycles.get(paneId);
			if (lifecycle) {
				const state = lifecycle.getState();
				if (state === "failed") {
					const reattached = await lifecycle.retry();
					if (reattached) {
						existing.pty = lifecycle.getPty()!;
					}
				}
			}
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

		if (existing && !existing.isAlive && existing.isExpectedDetach) {
			this.sessions.delete(paneId);
			this.osc7Buffers.delete(paneId);
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
		const cols = params.cols ?? 80;
		const rows = params.rows ?? 24;

		if (processPersistence.enabled) {
			try {
				if (await processPersistence.sessionExists(sessionName)) {
					const backendScrollback =
						await this.captureScrollbackBounded(sessionName);

					const lifecycle = this.getOrCreateLifecycle(
						paneId,
						sessionName,
						params,
					);
					const attached = await lifecycle.ensureAttached(cols, rows);

					if (attached && lifecycle.getPty()) {
						return this.setupPersistentSessionWithLifecycle(lifecycle, params, {
							scrollback: backendScrollback,
							wasRecovered: true,
							isPersistentBackend: true,
						});
					}

					console.warn(
						"[TerminalManager] Lifecycle attach failed, killing session",
					);
					await processPersistence.killSession(sessionName).catch(() => {});
					this.lifecycles.delete(paneId);
				}
			} catch (error) {
				console.warn("[TerminalManager] Failed to attach:", error);

				try {
					await processPersistence.killSession(sessionName);
					console.log(
						"[TerminalManager] Killed orphaned session:",
						sessionName,
					);
				} catch {}
				this.lifecycles.delete(paneId);
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

				const lifecycle = this.getOrCreateLifecycle(
					paneId,
					sessionName,
					params,
				);
				const attached = await lifecycle.ensureAttached(cols, rows);

				if (attached && lifecycle.getPty()) {
					return this.setupPersistentSessionWithLifecycle(lifecycle, params, {
						scrollback: "",
						wasRecovered: false,
						isPersistentBackend: true,
					});
				}

				console.warn(
					"[TerminalManager] Persistence failed after create, falling back",
				);
				this.lifecycles.delete(paneId);
			} catch (error) {
				console.warn(
					"[TerminalManager] Persistence failed, falling back:",
					error,
				);
				this.lifecycles.delete(paneId);
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

	private getOrCreateLifecycle(
		paneId: string,
		sessionName: string,
		params: CreateSessionParams,
	): SessionLifecycle {
		let lifecycle = this.lifecycles.get(paneId);
		if (!lifecycle) {
			lifecycle = new SessionLifecycle(sessionName, this.tmuxBackend, {
				onStateChange: (state, prev) =>
					this.handleLifecycleStateChange(paneId, state, prev),
				onData: (data) => this.handleLifecycleData(paneId, data),
				onError: (error, message) =>
					this.handleLifecycleError(paneId, error, message),
			});
			this.lifecycles.set(paneId, lifecycle);
		}
		return lifecycle;
	}

	private handleLifecycleStateChange(
		paneId: string,
		state: SessionState,
		prevState: SessionState,
	): void {
		const session = this.sessions.get(paneId);

		if (state === "connected" && prevState === "reconnecting") {
			console.log(`[TerminalManager] Reconnected session ${paneId}`);
			if (session) {
				session.isAlive = true;
				const lifecycle = this.lifecycles.get(paneId);
				if (lifecycle?.getPty()) {
					session.pty = lifecycle.getPty()!;
				}
			}
		}

		if (state === "failed") {
			this.emit(`error:${paneId}`, {
				type: "persistence-failed",
				recoverable: true,
			});
		}

		if (state === "closed" && session) {
			session.isAlive = false;
			this.emit(`exit:${paneId}`, 0, undefined);
		}
	}

	private handleLifecycleData(paneId: string, data: string): void {
		const session = this.sessions.get(paneId);
		if (!session) return;

		let dataToStore = data;

		if (containsClearScrollbackSequence(data)) {
			session.scrollback = "";
			reinitializeHistory(session).catch(() => {});
			dataToStore = extractContentAfterClear(data);
		}

		session.scrollback += dataToStore;
		session.historyWriter?.write(dataToStore);

		const osc7Buffer = (this.osc7Buffers.get(paneId) ?? "") + data;
		this.osc7Buffers.set(paneId, osc7Buffer.slice(-OSC7_BUFFER_SIZE));
		const newCwd = parseCwd(osc7Buffer);
		if (newCwd && newCwd !== session.cwd) {
			session.cwd = newCwd;
			session.historyWriter?.updateCwd(newCwd);
		}

		portManager.scanOutput(dataToStore, paneId, session.workspaceId);
		session.dataBatcher.write(data);
	}

	private handleLifecycleError(
		paneId: string,
		error: TmuxError,
		message: string,
	): void {
		console.warn(
			`[TerminalManager] Lifecycle error for ${paneId}:`,
			error,
			message,
		);
	}

	private async setupPersistentSessionWithLifecycle(
		lifecycle: SessionLifecycle,
		params: CreateSessionParams,
		opts: {
			scrollback: string;
			wasRecovered: boolean;
			isPersistentBackend: boolean;
		},
	): Promise<SessionResult> {
		const { paneId, workspaceId, initialCommands } = params;
		const ptyProcess = lifecycle.getPty()!;

		const historyReader = new HistoryReader(workspaceId, paneId);
		const savedMetadata = await historyReader.readMetadata();
		const cwd = params.cwd ?? savedMetadata?.cwd ?? os.homedir();
		const cols = params.cols ?? 80;
		const rows = params.rows ?? 24;

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

		this.sessions.set(paneId, session);

		if (opts.wasRecovered && opts.scrollback) {
			portManager.scanOutput(opts.scrollback, paneId, workspaceId);
		}

		if (!opts.wasRecovered && initialCommands && initialCommands.length > 0) {
			setTimeout(() => {
				if (session.isAlive) {
					const cmdString = `${initialCommands.join(" && ")}\n`;
					lifecycle.write(cmdString);
				}
			}, 100);
		}

		track("terminal_opened", { workspace_id: workspaceId, pane_id: paneId });

		return {
			isNew: true,
			scrollback: opts.scrollback,
			wasRecovered: opts.wasRecovered,
		};
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
			this.osc7Buffers.delete(paneId);

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

		const lifecycle = this.lifecycles.get(paneId);
		if (lifecycle) {
			if (lifecycle.canWrite()) {
				lifecycle.write(data);
			} else {
				const state = lifecycle.getState();
				if (state === "reconnecting" || state === "connecting") {
					console.warn(
						`[TerminalManager] Write dropped for ${paneId}: lifecycle in ${state} state`,
					);
					return;
				}
				throw new Error(
					`Cannot write to ${paneId}: lifecycle in ${state} state`,
				);
			}
		} else {
			session.pty.write(data);
		}
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
			const lifecycle = this.lifecycles.get(paneId);
			if (lifecycle) {
				lifecycle.resize(cols, rows);
			} else {
				session.pty.resize(cols, rows);
			}
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

		const lifecycle = this.lifecycles.get(paneId);
		if (lifecycle) {
			lifecycle.close();
			this.lifecycles.delete(paneId);
		}

		if (session.isPersistentBackend) {
			const sessionName = getSessionName(session.workspaceId, paneId);
			await processPersistence.killSession(sessionName).catch(() => {});
		}

		if (session.isAlive && !session.isExpectedDetach) {
			session.pty.kill();
		} else {
			this.osc7Buffers.delete(paneId);
			portManager.removePortsForPane(paneId);
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

			const lifecycle = this.lifecycles.get(paneId);
			if (lifecycle) {
				lifecycle.detach();
				this.lifecycles.delete(paneId);
			}

			session.isExpectedDetach = true;
			session.isAlive = false;
			await closeSessionHistoryForDetach(session);
			try {
				session.pty.kill();
			} catch {}
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
			const lifecycle = this.lifecycles.get(paneId);
			if (lifecycle) {
				lifecycle.detach();
			}

			if (session.isPersistentBackend && session.isAlive) {
				session.isExpectedDetach = true;
				session.isAlive = false;
				await closeSessionHistoryForDetach(session);
				try {
					session.pty.kill();
				} catch {}
			} else {
				await this.kill({ paneId });
			}
		}
		this.lifecycles.clear();
		this.osc7Buffers.clear();
		this.sessions.clear();
	}

	async cleanup(): Promise<void> {
		for (const lifecycle of this.lifecycles.values()) {
			lifecycle.close();
		}
		this.lifecycles.clear();

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
		this.osc7Buffers.clear();
		this.removeAllListeners();
	}
}

/** Singleton terminal manager instance */
export const terminalManager = new TerminalManager();
