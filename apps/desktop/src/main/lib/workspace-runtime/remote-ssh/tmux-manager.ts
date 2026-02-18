/**
 * Tmux Manager
 *
 * Manages remote tmux sessions for terminal persistence.
 * Session naming: superset-{paneId}
 * Falls back to raw-shell mode if tmux is not installed.
 */

import type { SSHConnection } from "./connection";

export class TmuxManager {
	private connection: SSHConnection;
	private _tmuxAvailable: boolean | null = null;

	constructor(connection: SSHConnection) {
		this.connection = connection;
	}

	/**
	 * Update the underlying connection (for reconnection scenarios).
	 */
	setConnection(connection: SSHConnection): void {
		this.connection = connection;
	}

	/**
	 * Check if tmux is installed on the remote host.
	 */
	async isTmuxAvailable(): Promise<boolean> {
		if (this._tmuxAvailable !== null) return this._tmuxAvailable;

		try {
			const result = await this.connection.exec("command -v tmux");
			this._tmuxAvailable = result.code === 0;
		} catch {
			this._tmuxAvailable = false;
		}

		return this._tmuxAvailable;
	}

	/**
	 * Check if a tmux session with the given name exists.
	 */
	async hasSession(name: string): Promise<boolean> {
		try {
			const result = await this.connection.exec(
				`tmux has-session -t ${escapeSessionName(name)} 2>/dev/null`,
			);
			return result.code === 0;
		} catch {
			return false;
		}
	}

	/**
	 * Create a new tmux session.
	 */
	async createSession(
		name: string,
		cols: number,
		rows: number,
		cwd?: string,
	): Promise<void> {
		const cdCmd = cwd ? `cd ${escapeShellArg(cwd)} && ` : "";
		const escaped = escapeSessionName(name);
		await this.connection.exec(
			`${cdCmd}tmux new-session -d -s ${escaped} -x ${cols} -y ${rows}`,
		);
		await this.ensureProxyPath(name, { applyToCurrentShell: true });
	}

	/**
	 * Ensure ~/.superset/bin is available in PATH for this tmux session.
	 * Safe to call repeatedly (existing sessions, reattach paths, etc.).
	 */
	async ensureProxyPath(
		name: string,
		options?: { applyToCurrentShell?: boolean },
	): Promise<void> {
		const escaped = escapeSessionName(name);
		await this.connection
			.exec(
				`tmux set-environment -t ${escaped} PATH "$HOME/.superset/bin:$PATH"`,
			)
			.catch(() => {});
		if (options?.applyToCurrentShell) {
			await this.connection
				.exec(
					`tmux send-keys -t ${escaped} 'export PATH="$HOME/.superset/bin:$PATH"' Enter`,
				)
				.catch(() => {});
		}
	}

	/**
	 * Capture scrollback from a tmux session.
	 */
	async captureScrollback(name: string, lines = 1000): Promise<string> {
		const result = await this.connection.exec(
			`tmux capture-pane -t ${escapeSessionName(name)} -p -S -${lines}`,
		);
		return result.stdout;
	}

	/**
	 * Kill a tmux session.
	 */
	async killSession(name: string): Promise<void> {
		await this.connection.exec(
			`tmux kill-session -t ${escapeSessionName(name)} 2>/dev/null`,
		);
	}

	/**
	 * List all tmux sessions matching the superset prefix.
	 */
	async listSessions(): Promise<
		Array<{ name: string; created: string; size: string }>
	> {
		try {
			const result = await this.connection.exec(
				'tmux list-sessions -F "#{session_name}|#{session_created}|#{session_width}x#{session_height}" 2>/dev/null',
			);
			if (result.code !== 0) return [];

			return result.stdout
				.trim()
				.split("\n")
				.filter((line) => line.startsWith("superset-"))
				.map((line) => {
					const [name, created, size] = line.split("|");
					return { name, created, size };
				});
		} catch {
			return [];
		}
	}

	/**
	 * Send keys (a command string) to a tmux session.
	 */
	async sendKeys(name: string, keys: string): Promise<void> {
		await this.connection.exec(
			`tmux send-keys -t ${escapeSessionName(name)} ${escapeShellArg(keys)} Enter`,
		);
	}

	/**
	 * Resize a tmux session window.
	 */
	async resizeSession(name: string, cols: number, rows: number): Promise<void> {
		await this.connection.exec(
			`tmux resize-window -t ${escapeSessionName(name)} -x ${cols} -y ${rows} 2>/dev/null`,
		);
	}

	/**
	 * Get the tmux session name for a pane ID.
	 */
	static sessionName(paneId: string): string {
		return `superset-${paneId}`;
	}
}

function escapeSessionName(name: string): string {
	// Tmux session names can contain alphanumeric, dash, underscore
	return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function escapeShellArg(arg: string): string {
	return `'${arg.replace(/'/g, "'\\''")}'`;
}
