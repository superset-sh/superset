/**
 * Remote SSH Terminal Runtime
 *
 * Implements TerminalRuntime for remote SSH workspaces using ssh2 + tmux.
 *
 * Key invariants:
 * 1. Stream subscriptions MUST NOT complete on session exit
 * 2. Event signatures match exactly: data:${paneId}, exit:${paneId}, etc.
 * 3. Sync operations (write, resize, signal, detach) must not block or throw
 * 4. Concurrent createOrAttach calls for the same paneId are deduplicated
 */

import { EventEmitter } from "node:events";
import type { CreateSessionParams, SessionResult } from "../../terminal/types";
import type { ListSessionsResponse } from "../../terminal-host/types";
import type {
	TerminalCapabilities,
	TerminalManagement,
	TerminalRuntime,
} from "../types";
import type { SSHConnection } from "./connection";
import { RemoteSSHSession } from "./session";
import { TmuxManager } from "./tmux-manager";

export class RemoteSSHTerminalRuntime
	extends EventEmitter
	implements TerminalRuntime
{
	readonly capabilities: TerminalCapabilities;
	readonly management: TerminalManagement;

	private sessions = new Map<string, RemoteSSHSession>();
	private pendingSessions = new Map<string, Promise<SessionResult>>();
	private connection: SSHConnection;
	private tmuxManager: TmuxManager;
	private tmuxAvailable = false;

	constructor(connection: SSHConnection) {
		super();
		this.setMaxListeners(100);

		this.connection = connection;
		this.tmuxManager = new TmuxManager(connection);

		// Will be updated after tmux availability check
		this.capabilities = {
			persistent: false,
			coldRestore: false,
		};

		this.management = {
			listSessions: () => this.listRemoteSessions(),
			killAllSessions: () => this.killAllRemoteSessions(),
			resetHistoryPersistence: async () => {
				/* no-op for SSH */
			},
		};

		// Wire connection events
		this.connection.on("disconnected", () => {
			for (const [paneId] of this.sessions) {
				this.emit(`disconnect:${paneId}`);
			}
		});

		this.connection.on("connected", () => {
			// Reattach sessions after reconnection
			void this.reattachSessions();
		});

		// Check tmux availability lazily
		void this.initTmuxCapability();
	}

	private async initTmuxCapability(): Promise<void> {
		try {
			this.tmuxAvailable = await this.tmuxManager.isTmuxAvailable();
			if (this.tmuxAvailable) {
				(this.capabilities as { persistent: boolean }).persistent = true;
				(this.capabilities as { coldRestore: boolean }).coldRestore = true;
			}
		} catch {
			// tmux not available, use raw shell mode
		}
	}

	// ===========================================================================
	// Session Operations
	// ===========================================================================

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId } = params;

		// Deduplicate concurrent calls for the same paneId
		const pending = this.pendingSessions.get(paneId);
		if (pending) return pending;

		const promise = this.doCreateOrAttach(params);
		this.pendingSessions.set(paneId, promise);

		try {
			return await promise;
		} finally {
			this.pendingSessions.delete(paneId);
		}
	}

	private async doCreateOrAttach(
		params: CreateSessionParams,
	): Promise<SessionResult> {
		const {
			paneId,
			workspaceId,
			cwd,
			cols = 80,
			rows = 24,
			initialCommands,
		} = params;

		// Ensure SSH is connected before trying to open a shell channel.
		// Registry warmup is async, so attach can race ahead on first mount.
		if (!this.connection.isConnected) {
			await this.connection.connect();
		}

		// Try to reattach to an existing alive session (e.g. after navigation away/back)
		const existing = this.sessions.get(paneId);
		if (existing?.isAlive) {
			const reattached = existing.reattachLocal();
			if (reattached) {
				existing.resize(cols, rows);

				// Capture tmux scrollback if available for buffer restoration
				let scrollback = "";
				if (this.tmuxAvailable) {
					const sessionName = TmuxManager.sessionName(paneId);
					scrollback = await this.tmuxManager
						.captureScrollback(sessionName)
						.catch(() => "");
				}

				return {
					isNew: false,
					wasRecovered: true,
					scrollback,
				};
			}
			// Channel died while detached — fall through to create new session
			this.sessions.delete(paneId);
		}

		const session = new RemoteSSHSession({
			paneId,
			workspaceId,
			connection: this.connection,
			tmuxManager: this.tmuxManager,
			useTmux: this.tmuxAvailable,
			cwd: cwd || "",
			callbacks: {
				onData: (data) => {
					this.emit(`data:${paneId}`, data);
				},
				onExit: (exitCode, signal) => {
					// CRITICAL: emit exit event but do NOT complete any subscription
					this.emit(`exit:${paneId}`, exitCode, signal);
				},
			},
		});

		this.sessions.set(paneId, session);

		const result = await session.createOrAttach(cols, rows, initialCommands);

		return {
			isNew: result.isNew,
			scrollback: result.initialContent,
			wasRecovered: result.wasRecovered,
		};
	}

	write(params: { paneId: string; data: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session) return;
		session.write(params.data);
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const session = this.sessions.get(params.paneId);
		if (!session) return;
		session.resize(params.cols, params.rows);
	}

	signal(params: { paneId: string; signal?: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session) return;
		session.signal(params.signal || "SIGINT");
	}

	async kill(params: { paneId: string }): Promise<void> {
		const session = this.sessions.get(params.paneId);
		if (!session) return;
		await session.kill();
		this.sessions.delete(params.paneId);
	}

	detach(params: { paneId: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session) return;
		session.detach();
	}

	clearScrollback(_params: { paneId: string }): void {
		// No-op for SSH sessions
	}

	ackColdRestore(_paneId: string): void {
		// No-op for SSH sessions
	}

	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null {
		const session = this.sessions.get(paneId);
		if (!session) return null;
		return {
			isAlive: session.isAlive,
			cwd: session.cwd,
			lastActive: session.lastActive,
		};
	}

	// ===========================================================================
	// Workspace Operations
	// ===========================================================================

	async killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		let killed = 0;
		let failed = 0;

		for (const [paneId, session] of this.sessions) {
			if (session.workspaceId === workspaceId) {
				try {
					await session.kill();
					this.sessions.delete(paneId);
					killed++;
				} catch {
					failed++;
				}
			}
		}

		return { killed, failed };
	}

	async getSessionCountByWorkspaceId(workspaceId: string): Promise<number> {
		let count = 0;
		for (const session of this.sessions.values()) {
			if (session.workspaceId === workspaceId && session.isAlive) {
				count++;
			}
		}
		return count;
	}

	refreshPromptsForWorkspace(workspaceId: string): void {
		for (const session of this.sessions.values()) {
			if (session.workspaceId === workspaceId && session.isAlive) {
				session.write("\n");
			}
		}
	}

	// ===========================================================================
	// Event Source
	// ===========================================================================

	detachAllListeners(): void {
		this.removeAllListeners();
	}

	// ===========================================================================
	// Management
	// ===========================================================================

	private async listRemoteSessions(): Promise<ListSessionsResponse> {
		const sessions: ListSessionsResponse["sessions"] = [];

		for (const [, session] of this.sessions) {
			sessions.push({
				sessionId: session.paneId,
				workspaceId: session.workspaceId,
				paneId: session.paneId,
				isAlive: session.isAlive,
				attachedClients: session.isAlive ? 1 : 0,
				pid: null,
			});
		}

		return { sessions };
	}

	private async killAllRemoteSessions(): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const [paneId, session] of this.sessions) {
			promises.push(
				session.kill().then(() => {
					this.sessions.delete(paneId);
				}),
			);
		}
		await Promise.allSettled(promises);
	}

	// ===========================================================================
	// Reconnection
	// ===========================================================================

	private async reattachSessions(): Promise<void> {
		if (!this.tmuxAvailable) return;

		for (const [paneId, session] of this.sessions) {
			try {
				const reattached = await session.reattach(this.connection, 80, 24);
				if (!reattached) {
					this.emit(`exit:${paneId}`, 0);
					this.sessions.delete(paneId);
				}
			} catch {
				this.emit(`error:${paneId}`, new Error("Failed to reattach session"));
			}
		}
	}

	// ===========================================================================
	// Cleanup
	// ===========================================================================

	async cleanup(): Promise<void> {
		await this.killAllRemoteSessions();
	}
}
