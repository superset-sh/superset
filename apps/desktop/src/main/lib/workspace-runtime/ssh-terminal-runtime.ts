/**
 * SSH Terminal Runtime
 *
 * Implements the TerminalRuntime interface backed by SshConnectionManager.
 * Sessions are ephemeral (no persistence across app restart) and scoped
 * to a single SSH host.
 */

import { EventEmitter } from "node:events";
import type { SshConnectionManager } from "../ssh/ssh-connection-manager";
import type { CreateSessionParams, SessionResult } from "../terminal/types";
import type { ListSessionsResponse } from "../terminal-host/types";
import type {
	TerminalCapabilities,
	TerminalManagement,
	TerminalRuntime,
} from "./types";

// =============================================================================
// SSH Terminal Runtime
// =============================================================================

/**
 * Terminal runtime backed by an SSH connection.
 *
 * Each instance is scoped to a single SSH host (identified by hostId).
 * Sessions opened through this runtime map directly to SSH shell channels
 * on that host.
 *
 * Capabilities:
 * - persistent: false  — sessions do not survive app restart
 * - coldRestore: false — no on-disk scrollback to recover from
 */
export class SshTerminalRuntime
	extends EventEmitter
	implements TerminalRuntime
{
	private readonly hostId: string;
	private readonly sshManager: SshConnectionManager;

	/** workspaceId → Set of paneIds registered under that workspace */
	private readonly workspacePanes = new Map<string, Set<string>>();

	/** paneId → bound data listener (for detach cleanup) */
	private readonly dataListeners = new Map<
		string,
		(paneId: string, data: Buffer) => void
	>();

	/** paneId → bound exit listener (for detach cleanup) */
	private readonly exitListeners = new Map<
		string,
		(paneId: string, code: number | null, signal?: string) => void
	>();

	readonly management: TerminalManagement;

	readonly capabilities: TerminalCapabilities = {
		persistent: false,
		coldRestore: false,
	};

	constructor(hostId: string, sshManager: SshConnectionManager) {
		super();
		this.hostId = hostId;
		this.sshManager = sshManager;

		this.management = {
			listSessions: () => this._listSessions(),
			killAllSessions: () => this._killAllSessions(),
			resetHistoryPersistence: async () => {
				/* no-op: SSH runtime has no history persistence */
			},
		};
	}

	// ===========================================================================
	// Session Operations
	// ===========================================================================

	/**
	 * Create a new SSH shell session or attach to an existing one for the given paneId.
	 *
	 * Registers the pane under the workspace, wires up data/exit event forwarding,
	 * and returns an empty SessionResult (SSH has no scrollback snapshot).
	 */
	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId, workspaceId, cols = 80, rows = 24, cwd } = params;

		// Register pane under workspace for workspace-scoped operations
		this._registerPane(workspaceId, paneId);

		// If already open (re-attach), just wire up listeners again
		const existing = this.sshManager.getSession(paneId);
		if (!existing) {
			await this.sshManager.openShell(this.hostId, paneId, {
				cols,
				rows,
				cwd,
			});
		}

		// Wire up event forwarding for this paneId
		this._attachListeners(paneId);

		return {
			isNew: !existing,
			scrollback: "",
			wasRecovered: false,
		};
	}

	/** Write data to a session's stdin. */
	write({ paneId, data }: { paneId: string; data: string }): void {
		try {
			this.sshManager.writeToSession(paneId, data);
		} catch (err) {
			console.error(
				`[SshTerminalRuntime] write error for pane ${paneId}:`,
				err,
			);
		}
	}

	/** Resize the PTY for a session. */
	resize({
		paneId,
		cols,
		rows,
	}: {
		paneId: string;
		cols: number;
		rows: number;
	}): void {
		try {
			this.sshManager.resizeSession(paneId, cols, rows);
		} catch (err) {
			console.error(
				`[SshTerminalRuntime] resize error for pane ${paneId}:`,
				err,
			);
		}
	}

	/** Send a signal to the session (e.g. "INT" for Ctrl+C). */
	signal({ paneId, signal }: { paneId: string; signal?: string }): void {
		try {
			this.sshManager.signalSession(paneId, signal ?? "INT");
		} catch (err) {
			console.error(
				`[SshTerminalRuntime] signal error for pane ${paneId}:`,
				err,
			);
		}
	}

	/** Kill the session channel. */
	async kill({ paneId }: { paneId: string }): Promise<void> {
		this._detachListeners(paneId);
		try {
			this.sshManager.closeSession(paneId);
		} catch (err) {
			console.error(`[SshTerminalRuntime] kill error for pane ${paneId}:`, err);
		}
		this._unregisterPane(paneId);
	}

	/**
	 * Detach from the session — removes local event listeners but keeps the
	 * SSH channel alive on the remote host.
	 */
	detach({ paneId }: { paneId: string }): void {
		this._detachListeners(paneId);
	}

	/**
	 * Clear scrollback — no-op for SSH (no headless emulator).
	 */
	clearScrollback(_params: { paneId: string }): void {
		/* no-op: SSH runtime has no headless emulator */
	}

	/**
	 * Acknowledge cold restore — no-op (cold restore not supported).
	 */
	ackColdRestore(_paneId: string): void {
		/* no-op: SSH runtime does not support cold restore */
	}

	/**
	 * Get session metadata for a pane, or null if not found.
	 */
	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null {
		const session = this.sshManager.getSession(paneId);
		if (!session) return null;
		return {
			isAlive: true,
			cwd: session.cwd,
			lastActive: session.createdAt,
		};
	}

	// ===========================================================================
	// Workspace Operations
	// ===========================================================================

	/**
	 * Kill all sessions belonging to a workspace.
	 * Returns counts of killed and failed sessions.
	 */
	async killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		const paneIds = this.workspacePanes.get(workspaceId);
		if (!paneIds || paneIds.size === 0) return { killed: 0, failed: 0 };

		let killed = 0;
		let failed = 0;

		for (const paneId of [...paneIds]) {
			try {
				await this.kill({ paneId });
				killed++;
			} catch (err) {
				console.error(
					`[SshTerminalRuntime] killByWorkspaceId: failed to kill pane ${paneId}:`,
					err,
				);
				failed++;
			}
		}

		return { killed, failed };
	}

	/**
	 * Count alive sessions for a workspace.
	 */
	async getSessionCountByWorkspaceId(workspaceId: string): Promise<number> {
		const paneIds = this.workspacePanes.get(workspaceId);
		if (!paneIds) return 0;
		let count = 0;
		for (const paneId of paneIds) {
			if (this.sshManager.getSession(paneId)) count++;
		}
		return count;
	}

	/**
	 * Send a newline to all sessions for a workspace to refresh shell prompts.
	 */
	refreshPromptsForWorkspace(workspaceId: string): void {
		const paneIds = this.workspacePanes.get(workspaceId);
		if (!paneIds) return;
		for (const paneId of paneIds) {
			try {
				this.sshManager.writeToSession(paneId, "\n");
			} catch {
				// ignore — session may have already exited
			}
		}
	}

	// ===========================================================================
	// Event Source
	// ===========================================================================

	/** Remove all terminal-specific listeners from this emitter. */
	detachAllListeners(): void {
		for (const paneId of this.dataListeners.keys()) {
			this._detachListeners(paneId);
		}
		this.removeAllListeners();
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/** Close all sessions for this host and clean up. */
	async cleanup(): Promise<void> {
		for (const session of this.sshManager.getSessionsByHost(this.hostId)) {
			this._detachListeners(session.paneId);
			try {
				this.sshManager.closeSession(session.paneId);
			} catch {
				// ignore
			}
		}
		this.workspacePanes.clear();
		this.removeAllListeners();
	}

	// ===========================================================================
	// Private helpers
	// ===========================================================================

	/** Wire up data/exit forwarding from sshManager events for a paneId. */
	private _attachListeners(paneId: string): void {
		// Remove stale listeners first to avoid duplicates on re-attach
		this._detachListeners(paneId);

		const dataListener = (id: string, data: Buffer) => {
			if (id === paneId) {
				this.emit(`data:${paneId}`, data.toString());
			}
		};

		const exitListener = (id: string, code: number | null, signal?: string) => {
			if (id === paneId) {
				this.emit(`exit:${paneId}`, code, signal);
				// Clean up our own tracking — session is gone
				this._detachListeners(paneId);
				this._unregisterPane(paneId);
			}
		};

		this.sshManager.on("session-data", dataListener);
		this.sshManager.on("session-exit", exitListener);

		this.dataListeners.set(paneId, dataListener);
		this.exitListeners.set(paneId, exitListener);
	}

	/** Remove data/exit forwarding listeners for a paneId. */
	private _detachListeners(paneId: string): void {
		const dataListener = this.dataListeners.get(paneId);
		if (dataListener) {
			this.sshManager.off("session-data", dataListener);
			this.dataListeners.delete(paneId);
		}

		const exitListener = this.exitListeners.get(paneId);
		if (exitListener) {
			this.sshManager.off("session-exit", exitListener);
			this.exitListeners.delete(paneId);
		}
	}

	/** Register a paneId under a workspaceId. */
	private _registerPane(workspaceId: string, paneId: string): void {
		let panes = this.workspacePanes.get(workspaceId);
		if (!panes) {
			panes = new Set();
			this.workspacePanes.set(workspaceId, panes);
		}
		panes.add(paneId);
	}

	/** Remove a paneId from all workspace mappings. */
	private _unregisterPane(paneId: string): void {
		for (const [workspaceId, panes] of this.workspacePanes) {
			panes.delete(paneId);
			if (panes.size === 0) {
				this.workspacePanes.delete(workspaceId);
			}
		}
	}

	/** List all sessions for this host in ListSessionsResponse format. */
	private async _listSessions(): Promise<ListSessionsResponse> {
		const sessions = this.sshManager.getSessionsByHost(this.hostId);
		return {
			sessions: sessions.map((s) => ({
				sessionId: s.paneId,
				workspaceId: this._findWorkspaceForPane(s.paneId) ?? "",
				paneId: s.paneId,
				isAlive: true,
				attachedClients: 1,
				pid: null,
				createdAt: new Date(s.createdAt).toISOString(),
			})),
		};
	}

	/** Kill all sessions for this host. */
	private async _killAllSessions(): Promise<void> {
		const sessions = this.sshManager.getSessionsByHost(this.hostId);
		for (const session of sessions) {
			await this.kill({ paneId: session.paneId });
		}
	}

	/** Reverse-lookup workspaceId for a paneId. */
	private _findWorkspaceForPane(paneId: string): string | undefined {
		for (const [workspaceId, panes] of this.workspacePanes) {
			if (panes.has(paneId)) return workspaceId;
		}
		return undefined;
	}
}
