import { EventEmitter } from "node:events";
import { track } from "main/lib/analytics";
import { ensureAgentHooks } from "../agent-setup/ensure-agent-hooks";
import { FALLBACK_SHELL, SHELL_CRASH_THRESHOLD_MS } from "./env";
import { portManager } from "./port-manager";
import {
	createHeadlessTerminal,
	createSession,
	flushSession,
	getSerializedScrollback,
	setupDataHandler,
} from "./session";
import type {
	CreateSessionParams,
	InternalCreateSessionParams,
	SessionResult,
	TerminalSession,
} from "./types";

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";

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
				scrollback: getSerializedScrollback(existing),
				wasRecovered: existing.wasRecovered,
			};
		}

		// Create new session
		const creationPromise = this.doCreateSession({
			...params,
			existingScrollback: existing ? getSerializedScrollback(existing) : null,
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
		const { paneId, workspaceId, initialCommands } = params;

		const agentHooksReady = ensureAgentHooks().catch((error): void => {
			console.warn("[TerminalManager] Agent hook ensure failed:", error);
		});

		// Create the session
		const session = await createSession(params, (id, data) => {
			this.emit(`data:${id}`, data);
		});

		// Match agent commands anywhere in the string (handles "cd repo && claude ...")
		const agentCommandPattern = /\b(claude|codex|opencode)\b/;
		const shouldAwaitAgentHooks =
			initialCommands?.some((command) => agentCommandPattern.test(command)) ??
			false;

		// Set up data handler
		setupDataHandler(
			session,
			initialCommands,
			session.wasRecovered,
			shouldAwaitAgentHooks ? agentHooksReady : undefined,
		);

		// Set up exit handler with fallback logic
		this.setupExitHandler(session, params);

		this.sessions.set(paneId, session);

		portManager.registerSession(session, workspaceId);

		// Track terminal opened (only fires once per session creation)
		track("terminal_opened", { workspace_id: workspaceId, pane_id: paneId });

		return {
			isNew: true,
			scrollback: getSerializedScrollback(session),
			wasRecovered: session.wasRecovered,
		};
	}

	private setupExitHandler(
		session: TerminalSession,
		params: InternalCreateSessionParams,
	): void {
		const { paneId } = params;

		session.pty.onExit(async ({ exitCode, signal }) => {
			const sessionDuration = Date.now() - session.startTime;
			const logPayload: Record<string, unknown> = {
				paneId,
				shell: session.shell,
				exitCode,
				signal,
				sessionDuration,
			};
			if (DEBUG_TERMINAL) {
				logPayload.cwd = session.cwd;
			}
			console.log("[TerminalManager] Shell exited:", logPayload);

			session.isAlive = false;
			session.writeQueue.dispose();

			// Must capture before flush (flush disposes headless terminal)
			const existingScrollback = getSerializedScrollback(session);
			flushSession(session);

			// Check if shell crashed quickly - try fallback
			const crashedQuickly =
				sessionDuration < SHELL_CRASH_THRESHOLD_MS && exitCode !== 0;

			if (crashedQuickly && !session.usedFallback) {
				console.warn(
					`[TerminalManager] Shell "${session.shell}" exited with code ${exitCode} after ${sessionDuration}ms, retrying with fallback shell "${FALLBACK_SHELL}"`,
				);

				this.sessions.delete(paneId);

				try {
					await this.doCreateSession({
						...params,
						existingScrollback,
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

			// Unregister from port manager (also removes detected ports)
			portManager.unregisterSession(paneId);

			this.emit(`exit:${paneId}`, exitCode, signal);
			this.emit("terminalExit", { paneId, exitCode, signal });

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

		if (!session.writeQueue.write(data)) {
			throw new Error(`Terminal ${paneId} write queue full`);
		}
		session.lastActive = Date.now();
	}

	/**
	 * Acknowledge cold restore (no-op in non-daemon mode).
	 * Cold restore only applies to daemon mode where sessions survive app restart.
	 */
	ackColdRestore(_paneId: string): void {
		// No-op in non-daemon mode - cold restore is a daemon-only feature
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
			session.headless.resize(cols, rows);
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

	async kill(params: { paneId: string }): Promise<void> {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(`Cannot kill terminal ${paneId}: session not found`);
			return;
		}

		if (session.isAlive) {
			session.pty.kill();
		} else {
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

	clearScrollback(params: { paneId: string }): void {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(
				`Cannot clear scrollback for terminal ${paneId}: session not found`,
			);
			return;
		}

		// Recreate headless (xterm writes are async, so clear() alone is unreliable)
		session.headless.dispose();
		const { headless, serializer } = createHeadlessTerminal({
			cols: session.cols,
			rows: session.rows,
		});
		session.headless = headless;
		session.serializer = serializer;
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

	private killSessionWithTimeout(
		paneId: string,
		session: TerminalSession,
	): Promise<boolean> {
		if (!session.isAlive) {
			session.writeQueue.dispose();
			this.sessions.delete(paneId);
			return Promise.resolve(true);
		}

		session.writeQueue.dispose();

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
				cleanup(false);
			}
		});
	}

	async getSessionCountByWorkspaceId(workspaceId: string): Promise<number> {
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
					session.writeQueue.write("\n");
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
				session.writeQueue.dispose();
				session.pty.kill();
			} else {
				session.writeQueue.dispose();
			}
		}

		await Promise.all(exitPromises);
		this.sessions.clear();
		this.removeAllListeners();
	}
}

/** Singleton terminal manager instance */
export const terminalManager = new TerminalManager();
