import { EventEmitter } from "node:events";
import os from "node:os";
import { track } from "main/lib/analytics";
import { sanitizeTerminalScrollback } from "shared/terminal-scrollback-sanitizer";
import { HistoryReader, HistoryWriter } from "../terminal-history";
import {
	buildTerminalEnv,
	FALLBACK_SHELL,
	getDefaultShell,
	SHELL_CRASH_THRESHOLD_MS,
} from "./env";
import { getSessionName, processPersistence } from "./persistence/manager";
import type { SessionLifecycle } from "./persistence/session-lifecycle";
import type { PersistenceErrorCode, SessionState } from "./persistence/types";
import { portManager } from "./port-manager";
import {
	closeSessionHistory,
	closeSessionHistoryForDetach,
	createSession,
	flushSession,
	processTerminalChunk,
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
	private osc7Buffers = new Map<string, string>();

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId, cols, rows } = params;

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
						const pty = lifecycle.getPty();
						if (pty) {
							existing.pty = pty;
						}
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

		// Always attempt to attach to an existing tmux session if it exists (even if
		// persistence is currently disabled) so we don't orphan long-running shells.
		try {
			if (await processPersistence.sessionExists(sessionName)) {
				const backendScrollback =
					await this.captureScrollbackBounded(sessionName);

				const lifecycle = this.getOrCreateLifecycle(paneId, sessionName);
				const attached = await lifecycle.ensureAttached(cols, rows);

				if (attached && lifecycle.getPty()) {
					return this.setupPersistentSessionWithLifecycle(lifecycle, params, {
						scrollback: backendScrollback,
						wasRecovered: true,
						isPersistentBackend: true,
					});
				}

				// Attach failed - check if error indicates session provably doesn't exist
				const errorCode = lifecycle.lastErrorCode;
				if (errorCode && lifecycle.isSafeToProceed()) {
					// Safe to proceed - session doesn't exist, just clear state and fall back
					console.log(
						`[TerminalManager] Attach failed with ${errorCode}, session doesn't exist - falling back`,
					);
					this.lifecycles.delete(paneId);
				} else {
					// Session may still be running - preserve it and surface error to user
					console.warn(
						`[TerminalManager] Attach failed with ${errorCode ?? "unknown"}, preserving tmux session for manual recovery`,
					);
					this.emit(`attach-failed:${paneId}`, {
						sessionName,
						errorCode: errorCode ?? "ATTACH_FAILED",
						recoverable: true,
					});
					// Don't delete lifecycle - user may retry
					// Don't kill session - it may have running processes
					// Return a result indicating recovery is needed
					return {
						isNew: false,
						scrollback: backendScrollback,
						wasRecovered: false,
						attachFailed: true,
						errorCode: errorCode ?? "ATTACH_FAILED",
					};
				}
			}
		} catch (error) {
			console.warn("[TerminalManager] Failed to attach:", error);

			// For unexpected errors, check if we can safely proceed
			const lifecycle = this.lifecycles.get(paneId);
			const errorCode = lifecycle?.lastErrorCode;
			if (errorCode && lifecycle?.isSafeToProceed()) {
				console.log(
					`[TerminalManager] Error classified as ${errorCode}, safe to proceed`,
				);
				this.lifecycles.delete(paneId);
			} else {
				// Preserve session - emit error for user action
				console.warn(
					`[TerminalManager] Unexpected attach error, preserving session for manual recovery`,
				);
				this.emit(`attach-failed:${paneId}`, {
					sessionName,
					errorCode: errorCode ?? "ATTACH_FAILED",
					recoverable: true,
				});
				return {
					isNew: false,
					scrollback: "",
					wasRecovered: false,
					attachFailed: true,
					errorCode: errorCode ?? "ATTACH_FAILED",
				};
			}
		}

		// Only create new persistent tmux sessions when the user preference is enabled.
		if (processPersistence.enabled) {
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

				const lifecycle = this.getOrCreateLifecycle(paneId, sessionName);
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
				await processPersistence.killSession(sessionName).catch(() => {});
				this.lifecycles.delete(paneId);
			} catch (error) {
				console.warn(
					"[TerminalManager] Persistence failed, falling back:",
					error,
				);
				await processPersistence.killSession(sessionName).catch(() => {});
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
			const scrollback =
				await processPersistence.captureScrollback(sessionName);
			const bounded =
				scrollback.length > MAX_SCROLLBACK_CHARS
					? scrollback.slice(-MAX_SCROLLBACK_CHARS)
					: scrollback;
			return sanitizeTerminalScrollback(bounded);
		} catch {
			return "";
		}
	}

	private getOrCreateLifecycle(
		paneId: string,
		sessionName: string,
	): SessionLifecycle {
		let lifecycle = this.lifecycles.get(paneId);
		if (!lifecycle) {
			lifecycle = processPersistence.createLifecycle(sessionName, {
				onStateChange: (state, prev) =>
					this.handleLifecycleStateChange(paneId, state, prev),
				onError: (error, message) =>
					this.handleLifecycleError(paneId, error, message),
			});
			this.lifecycles.set(paneId, lifecycle);
		}
		return lifecycle;
	}

	/**
	 * Unified cleanup for terminal sessions.
	 * Handles history, ports, osc7 buffers, and lifecycles with identity guards.
	 */
	private async cleanupSession(
		paneId: string,
		session: TerminalSession,
		exitCode?: number,
	): Promise<void> {
		// Clear any existing timeout (make idempotent)
		if (session.cleanupTimeout) {
			clearTimeout(session.cleanupTimeout);
			session.cleanupTimeout = undefined;
		}

		// Snapshot lifecycle before any await
		const lifecycle = this.lifecycles.get(paneId);

		flushSession(session); // Sync - disposes dataBatcher
		this.osc7Buffers.delete(paneId);

		await closeSessionHistory(session, exitCode);

		// Identity guard after await - abort if session was replaced
		if (this.sessions.get(paneId) !== session) {
			return;
		}

		portManager.removePortsForPane(paneId);

		// Only delete lifecycle if it's still the same one
		if (this.lifecycles.get(paneId) === lifecycle) {
			this.lifecycles.delete(paneId);
		}

		// Delayed session cleanup with identity guard
		session.cleanupTimeout = setTimeout(() => {
			if (this.sessions.get(paneId) === session) {
				this.sessions.delete(paneId);
			}
		}, 5000);
		session.cleanupTimeout.unref();
	}

	private handleLifecycleStateChange(
		paneId: string,
		state: SessionState,
		prevState: SessionState,
	): void {
		const session = this.sessions.get(paneId);
		const lifecycle = this.lifecycles.get(paneId);

		// Detect reconnection: connected after a retry cycle
		// The state flow is: reconnecting → connecting → connected
		// So we can't check prevState === "reconnecting" directly
		if (state === "connected" && lifecycle?.wasRetrying) {
			console.log(`[TerminalManager] Reconnected session ${paneId}`);
			if (session) {
				session.isAlive = true;
				const pty = lifecycle.getPty();
				if (pty) {
					session.pty = pty;
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
			void this.cleanupSession(paneId, session, 0).catch((err) =>
				console.error(
					`[TerminalManager] cleanupSession failed for ${paneId}:`,
					err,
				),
			);
			this.emit(`exit:${paneId}`, 0, undefined);
		}
	}

	private handleLifecycleData(paneId: string, data: string): void {
		const session = this.sessions.get(paneId);
		if (!session) return;

		const osc7Buffer = this.osc7Buffers.get(paneId) ?? "";
		const { newOsc7Buffer } = processTerminalChunk(
			session,
			data,
			osc7Buffer,
			() => reinitializeHistory(session),
		);
		this.osc7Buffers.set(paneId, newOsc7Buffer.slice(-OSC7_BUFFER_SIZE));
	}

	private handleLifecycleError(
		paneId: string,
		error: PersistenceErrorCode,
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
		const ptyProcess = lifecycle.getPty();
		if (!ptyProcess) {
			throw new Error(
				`[TerminalManager] Expected PTY to be available for pane ${paneId}`,
			);
		}

		const historyReader = new HistoryReader(workspaceId, paneId);
		const savedMetadata = await historyReader.readMetadata();
		const cwd = params.cwd ?? savedMetadata?.cwd ?? os.homedir();
		const cols = params.cols ?? 80;
		const rows = params.rows ?? 24;

		// If recovering but tmux capture failed/timed out, fall back to disk backup
		// This prevents truncating the safety-net scrollback when tmux has issues
		let effectiveScrollback = opts.scrollback;
		if (opts.wasRecovered && !opts.scrollback) {
			const diskHistory = await historyReader.read();
			if (diskHistory.scrollback) {
				const MAX_SCROLLBACK_CHARS = 500_000;
				effectiveScrollback = sanitizeTerminalScrollback(
					diskHistory.scrollback.length > MAX_SCROLLBACK_CHARS
						? diskHistory.scrollback.slice(-MAX_SCROLLBACK_CHARS)
						: diskHistory.scrollback,
				);
				console.log(
					`[TerminalManager] tmux capture failed, recovered ${effectiveScrollback.length} chars from disk`,
				);
			}
		}

		// 1. Create session object first (without historyWriter)
		const session: TerminalSession = {
			pty: ptyProcess,
			paneId,
			workspaceId,
			cwd,
			cols,
			rows,
			lastActive: Date.now(),
			scrollback: effectiveScrollback,
			isAlive: true,
			wasRecovered: opts.wasRecovered,
			dataBatcher: new (await import("../data-batcher")).DataBatcher((data) => {
				this.emit(`data:${paneId}`, data);
			}),
			shell: getDefaultShell(),
			startTime: Date.now(),
			usedFallback: false,
			isPersistentBackend: opts.isPersistentBackend,
		};

		// 2. Store session BEFORE async history init (so data handler can find it)
		this.sessions.set(paneId, session);

		// 3. Init history writer - use effectiveScrollback to preserve disk backup
		const historyWriter = new HistoryWriter(
			workspaceId,
			paneId,
			cwd,
			cols,
			rows,
		);
		await historyWriter.init(effectiveScrollback || undefined);
		session.historyWriter = historyWriter;

		// 4. NOW wire data handler (will flush any buffered data)
		lifecycle.setDataHandler((data) => this.handleLifecycleData(paneId, data));

		if (opts.wasRecovered && effectiveScrollback) {
			portManager.scanOutput(effectiveScrollback, paneId, workspaceId);
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
			scrollback: effectiveScrollback,
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

				// Clear any existing timeout before restart
				if (session.cleanupTimeout) {
					clearTimeout(session.cleanupTimeout);
					session.cleanupTimeout = undefined;
				}

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
		const { paneId, signal = "SIGINT" } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot signal terminal ${paneId}: session not found or not alive`,
			);
			return;
		}

		// SIGINT = interrupt current command (Ctrl+C semantics)
		// Other signals = terminate the session
		if (signal === "SIGINT") {
			if (session.isPersistentBackend) {
				const lifecycle = this.lifecycles.get(paneId);
				lifecycle?.write("\x03");
			} else {
				// Write Ctrl+C to interrupt foreground process (not pty.kill which signals shell)
				session.pty.write("\x03");
			}
		} else {
			// SIGTERM/SIGKILL → kill the session entirely
			void this.kill({ paneId }).catch((err) =>
				console.error(`[TerminalManager] kill failed for ${paneId}:`, err),
			);
		}
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

		if (session.isPersistentBackend) {
			// Persistent: detach → delete lifecycle → kill tmux → manual cleanup
			if (lifecycle) {
				await lifecycle.detach();
				this.lifecycles.delete(paneId); // Delete immediately to prevent writes/resizes
			}

			// Kill underlying tmux session
			const sessionName = getSessionName(session.workspaceId, paneId);
			await processPersistence.killSession(sessionName).catch(() => {});

			// Manual cleanup + emit (single authoritative path)
			session.isAlive = false;
			await this.cleanupSession(paneId, session, 0);
			this.emit(`exit:${paneId}`, 0, undefined);
		} else {
			// Non-persistent: close lifecycle, kill PTY, let setupExitHandler handle cleanup
			if (lifecycle) {
				await lifecycle.close();
				this.lifecycles.delete(paneId);
			}
			if (session.isAlive) {
				session.pty.kill();
			}
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

	/**
	 * Kill a persistent tmux session by workspaceId + paneId.
	 * Used when attach failed and user wants to kill the orphaned session.
	 * This works even when there's no active TerminalSession.
	 */
	async killPersistentSession(params: {
		workspaceId: string;
		paneId: string;
	}): Promise<void> {
		const { workspaceId, paneId } = params;
		const sessionName = getSessionName(workspaceId, paneId);

		console.log(`[TerminalManager] Killing persistent session: ${sessionName}`);

		// Clean up any existing lifecycle
		const lifecycle = this.lifecycles.get(paneId);
		if (lifecycle) {
			try {
				await lifecycle.close();
			} catch {}
			this.lifecycles.delete(paneId);
		}

		// Kill the tmux session
		await processPersistence.killSession(sessionName).catch((err) => {
			console.warn(
				`[TerminalManager] Failed to kill tmux session ${sessionName}:`,
				err,
			);
		});

		// Clean up any existing session state
		const session = this.sessions.get(paneId);
		if (session) {
			session.isAlive = false;
			await this.cleanupSession(paneId, session, 0);
			this.emit(`exit:${paneId}`, 0, undefined);
		}
	}

	/**
	 * Retry attaching to a persistent session after a previous attach failure.
	 * Clears any failed lifecycle state and attempts fresh attach.
	 */
	async retryAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId } = params;

		console.log(`[TerminalManager] Retrying attach for pane ${paneId}`);

		// Clean up any failed lifecycle state
		const existingLifecycle = this.lifecycles.get(paneId);
		if (existingLifecycle) {
			try {
				await existingLifecycle.close();
			} catch {}
			this.lifecycles.delete(paneId);
		}

		// Clear any pending session promise
		this.pendingSessions.delete(paneId);

		// Attempt fresh attach through normal flow
		return this.createOrAttach(params);
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

		// Separate persistent vs non-persistent sessions
		const persistentSessions = sessionsToKill.filter(
			([, s]) => s.isPersistentBackend,
		);
		const nonPersistentSessions = sessionsToKill.filter(
			([, s]) => !s.isPersistentBackend,
		);

		let killed = 0;

		// --- Handle persistent sessions: detach → kill tmux → manual cleanup ---

		// 1. Detach all persistent lifecycles (stops reconnect, no "closed" events)
		for (const [paneId] of persistentSessions) {
			const lifecycle = this.lifecycles.get(paneId);
			if (lifecycle) {
				await lifecycle.detach();
				this.lifecycles.delete(paneId); // Delete immediately
			}
		}

		// 2. Kill all tmux sessions
		await processPersistence.killByWorkspace(workspaceId);

		// 3. Manual cleanup + emit for persistent sessions
		for (const [paneId, session] of persistentSessions) {
			try {
				session.deleteHistoryOnExit = true;
				session.isAlive = false;
				await this.cleanupSession(paneId, session, 0);
				this.emit(`exit:${paneId}`, 0, undefined);
				killed++;
			} catch {
				// Count as failed but continue
			}
		}

		// --- Handle non-persistent sessions: use killSessionWithTimeout ---
		const nonPersistentResults = await Promise.all(
			nonPersistentSessions.map(([paneId, session]) =>
				this.killSessionWithTimeout(paneId, session),
			),
		);
		killed += nonPersistentResults.filter(Boolean).length;

		const failed = sessionsToKill.length - killed;
		return { killed, failed };
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

			if (session.isPersistentBackend) {
				if (session.cleanupTimeout) {
					clearTimeout(session.cleanupTimeout);
					session.cleanupTimeout = undefined;
				}

				if (lifecycle) {
					this.lifecycles.delete(paneId);
				}

				session.isExpectedDetach = true;
				session.isAlive = false;
				await closeSessionHistoryForDetach(session);
				try {
					session.pty.kill();
				} catch {}
				continue;
			}

			await this.kill({ paneId });
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
			if (session.isPersistentBackend) {
				const sessionName = getSessionName(session.workspaceId, paneId);
				await processPersistence.killSession(sessionName).catch(() => {});
			}

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
