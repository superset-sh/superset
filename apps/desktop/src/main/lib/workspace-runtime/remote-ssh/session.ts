/**
 * Remote SSH Session
 *
 * Manages a single terminal pane over SSH + tmux.
 * Handles creation, attachment, reattachment after reconnection,
 * and data flow through callbacks.
 */

import type { ClientChannel } from "ssh2";
import type { SSHConnection } from "./connection";
import { TmuxManager } from "./tmux-manager";

export interface RemoteSessionCallbacks {
	onData: (data: string) => void;
	onExit: (exitCode: number, signal?: number) => void;
}

export interface CreateOrAttachResult {
	isNew: boolean;
	wasRecovered: boolean;
	initialContent: string;
}

export class RemoteSSHSession {
	readonly paneId: string;
	readonly workspaceId: string;

	private connection: SSHConnection;
	private tmuxManager: TmuxManager;
	private channel: ClientChannel | null = null;
	private callbacks: RemoteSessionCallbacks;
	private _isAlive = false;
	private _isDetached = false;
	private _cwd: string;
	private _lastActive: number = Date.now();
	private useTmux: boolean;

	constructor(params: {
		paneId: string;
		workspaceId: string;
		connection: SSHConnection;
		tmuxManager: TmuxManager;
		callbacks: RemoteSessionCallbacks;
		useTmux: boolean;
		cwd: string;
	}) {
		this.paneId = params.paneId;
		this.workspaceId = params.workspaceId;
		this.connection = params.connection;
		this.tmuxManager = params.tmuxManager;
		this.callbacks = params.callbacks;
		this.useTmux = params.useTmux;
		this._cwd = params.cwd;
	}

	get isAlive(): boolean {
		return this._isAlive;
	}

	get isDetached(): boolean {
		return this._isDetached;
	}

	get cwd(): string {
		return this._cwd;
	}

	get lastActive(): number {
		return this._lastActive;
	}

	/**
	 * Create a new session or attach to an existing tmux session.
	 */
	async createOrAttach(
		cols: number,
		rows: number,
		initialCommands?: string[],
		env?: Record<string, string>,
	): Promise<CreateOrAttachResult> {
		const sessionName = TmuxManager.sessionName(this.paneId);

		if (this.useTmux) {
			const exists = await this.tmuxManager.hasSession(sessionName);

			if (exists) {
				// Recover existing session
				const scrollback =
					await this.tmuxManager.captureScrollback(sessionName);
				await this.tmuxManager.resizeSession(sessionName, cols, rows);
				await this.tmuxManager.ensureProxyPath(sessionName);

				this.channel = await this.connection.openShell(cols, rows, env);
				this.wireChannel();

				// Attach to the existing tmux session
				this.channel.write(`tmux attach-session -t ${sessionName}\n`);

				this._isAlive = true;
				this._lastActive = Date.now();

				return {
					isNew: false,
					wasRecovered: true,
					initialContent: scrollback,
				};
			}

			// Create new tmux session
			await this.tmuxManager.createSession(sessionName, cols, rows, this._cwd);
			await this.tmuxManager.ensureProxyPath(sessionName);

			this.channel = await this.connection.openShell(cols, rows, env);
			this.wireChannel();

			// Attach and run initial commands
			this.channel.write(`tmux attach-session -t ${sessionName}\n`);

			if (initialCommands?.length) {
				for (const cmd of initialCommands) {
					// Send commands through tmux
					await this.tmuxManager.sendKeys(sessionName, cmd).catch(() => {
						// Fallback: write directly
						this.channel?.write(`${cmd}\n`);
					});
				}
			}
		} else {
			// Raw shell mode (no tmux)
			this.channel = await this.connection.openShell(cols, rows, env);
			this.wireChannel();

			// Ensure clipboard proxy scripts are on PATH
			this.channel.write('export PATH="$HOME/.superset/bin:$PATH"\n');

			if (this._cwd) {
				this.channel.write(`cd ${escapeShellArg(this._cwd)}\n`);
			}

			if (initialCommands?.length) {
				for (const cmd of initialCommands) {
					this.channel.write(`${cmd}\n`);
				}
			}
		}

		this._isAlive = true;
		this._lastActive = Date.now();

		return {
			isNew: true,
			wasRecovered: false,
			initialContent: "",
		};
	}

	/**
	 * Write data to the terminal.
	 */
	write(data: string): void {
		if (!this.channel || !this._isAlive) return;
		this._lastActive = Date.now();
		this.channel.write(data);
	}

	/**
	 * Resize the terminal.
	 */
	resize(cols: number, rows: number): void {
		if (!this.channel) return;
		this.channel.setWindow(rows, cols, 0, 0);

		if (this.useTmux) {
			const sessionName = TmuxManager.sessionName(this.paneId);
			this.tmuxManager.resizeSession(sessionName, cols, rows).catch(() => {});
		}
	}

	/**
	 * Send a signal to the terminal process.
	 */
	signal(sig: string): void {
		if (!this.channel) return;
		// Send Ctrl+C for SIGINT
		if (sig === "SIGINT") {
			this.channel.write("\x03");
		}
	}

	/**
	 * Kill the terminal session.
	 */
	async kill(): Promise<void> {
		this._isAlive = false;
		this._isDetached = false;

		if (this.useTmux) {
			const sessionName = TmuxManager.sessionName(this.paneId);
			await this.tmuxManager.killSession(sessionName).catch(() => {});
		}

		if (this.channel) {
			this.channel.close();
			this.channel = null;
		}
	}

	/**
	 * Detach from the session (keep SSH channel and shell alive).
	 * Data events continue to fire but are silently discarded since
	 * no renderer subscription is listening.
	 */
	detach(): void {
		this._isDetached = true;
	}

	/**
	 * Reattach after a local detach (navigation away and back).
	 * Returns true if the session is still alive and was reattached.
	 */
	reattachLocal(): boolean {
		if (!this._isAlive || !this.channel) return false;
		this._isDetached = false;
		return true;
	}

	/**
	 * Reattach to the session after SSH reconnection.
	 */
	async reattach(
		connection: SSHConnection,
		cols: number,
		rows: number,
	): Promise<boolean> {
		this.connection = connection;

		if (!this.useTmux) return false;

		const sessionName = TmuxManager.sessionName(this.paneId);
		const exists = await this.tmuxManager.hasSession(sessionName);
		if (!exists) return false;
		await this.tmuxManager.ensureProxyPath(sessionName);

		this.channel = await connection.openShell(cols, rows);
		this.wireChannel();
		this.channel.write(`tmux attach-session -t ${sessionName}\n`);
		this._isAlive = true;

		return true;
	}

	private wireChannel(): void {
		if (!this.channel) return;

		this.channel.on("data", (data: Buffer) => {
			this._lastActive = Date.now();
			this.callbacks.onData(data.toString());
		});

		this.channel.on("close", () => {
			this._isAlive = false;
			this._isDetached = false;
			this.callbacks.onExit(0);
		});

		this.channel.stderr?.on("data", (data: Buffer) => {
			this.callbacks.onData(data.toString());
		});
	}
}

function escapeShellArg(arg: string): string {
	return `'${arg.replace(/'/g, "'\\''")}'`;
}
