import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
// ssh2 may need a dynamic-style import for Electron compatibility.
// Using named imports directly works when the module is bundled correctly.
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import type {
	SshConnectionEvents,
	SshConnectionInfo,
	SshConnectionState,
	SshHostConfig,
	SshSessionInfo,
} from "./types";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_MS = 1000;

function shellEscape(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}

export class SshConnectionManager extends EventEmitter {
	private connections = new Map<string, SshConnectionInfo>();
	private sessions = new Map<string, SshSessionInfo>();
	private sftpClients = new Map<string, SFTPWrapper>();
	private reconnectTimers = new Map<string, NodeJS.Timeout>();

	// -------------------------------------------------------------------
	// Typed EventEmitter overrides
	// -------------------------------------------------------------------

	override on<K extends keyof SshConnectionEvents>(
		event: K,
		listener: SshConnectionEvents[K],
	): this {
		return super.on(event, listener);
	}

	override emit<K extends keyof SshConnectionEvents>(
		event: K,
		...args: Parameters<SshConnectionEvents[K]>
	): boolean {
		return super.emit(event, ...args);
	}

	// -------------------------------------------------------------------
	// Connection management
	// -------------------------------------------------------------------

	/**
	 * Connect to an SSH host. The connection is pooled by hostId.
	 * Supports password, privateKey (reads key file from disk), and agent auth.
	 */
	async connect(
		config: SshHostConfig,
		credentials?: { password?: string; passphrase?: string },
	): Promise<void> {
		const existing = this.connections.get(config.id);
		if (existing?.state === "connected" && existing.client) {
			return;
		}

		this.setState(config.id, "connecting");

		return new Promise<void>((resolve, reject) => {
			const client = new Client();

			client.on("ready", () => {
				const info = this.connections.get(config.id);
				if (info) {
					info.client = client;
					info.reconnectAttempts = 0;
				}
				this.setState(config.id, "connected");
				resolve();
			});

			client.on("error", (err: Error) => {
				console.error(
					`[SshConnectionManager] Connection error for ${config.id}:`,
					err.message,
				);
				const info = this.connections.get(config.id);
				if (info?.state !== "connected") {
					this.setState(config.id, "error", err.message);
					reject(err);
				} else {
					this.handleDisconnect(config);
				}
			});

			client.on("close", () => {
				const info = this.connections.get(config.id);
				if (info?.state === "connected" || info?.state === "reconnecting") {
					this.handleDisconnect(config);
				}
			});

			client.on("end", () => {
				const info = this.connections.get(config.id);
				if (info?.state === "connected") {
					this.handleDisconnect(config);
				}
			});

			this.connections.set(config.id, {
				hostId: config.id,
				state: "connecting",
				client,
				reconnectAttempts: 0,
			});

			this.buildConnectConfig(config, credentials)
				.then((connectConfig) => {
					client.connect(connectConfig);
				})
				.catch((err: Error) => {
					this.setState(config.id, "error", err.message);
					reject(err);
				});
		});
	}

	/**
	 * Disconnect from a host, closing all associated sessions and SFTP clients.
	 */
	disconnect(hostId: string): void {
		this.clearReconnectTimer(hostId);

		// Close all sessions for this host
		for (const session of this.getSessionsByHost(hostId)) {
			this.closeSession(session.paneId);
		}

		// Close SFTP client if cached
		const sftp = this.sftpClients.get(hostId);
		if (sftp) {
			try {
				sftp.end();
			} catch {
				// ignore
			}
			this.sftpClients.delete(hostId);
		}

		const info = this.connections.get(hostId);
		if (info?.client) {
			try {
				info.client.end();
			} catch {
				// ignore
			}
		}

		this.connections.delete(hostId);
		this.setState(hostId, "disconnected");
	}

	/** Get the active ssh2 Client for a host, or null if not connected. */
	getConnection(hostId: string): Client | null {
		const info = this.connections.get(hostId);
		return info?.state === "connected" ? (info.client ?? null) : null;
	}

	/** Returns true if the host connection is in the "connected" state. */
	isConnected(hostId: string): boolean {
		return this.connections.get(hostId)?.state === "connected";
	}

	/** Get the current connection state for a host. */
	getState(hostId: string): SshConnectionState {
		return this.connections.get(hostId)?.state ?? "disconnected";
	}

	// -------------------------------------------------------------------
	// Shell sessions
	// -------------------------------------------------------------------

	/**
	 * Open an interactive shell channel with a PTY on the given host.
	 * Tracks the session in the internal map and wires up data/exit events.
	 */
	async openShell(
		hostId: string,
		paneId: string,
		options: {
			cols: number;
			rows: number;
			cwd?: string;
			env?: Record<string, string>;
		},
	): Promise<void> {
		const client = this.getConnection(hostId);
		if (!client) {
			throw new Error(`[SshConnectionManager] Host ${hostId} is not connected`);
		}

		return new Promise<void>((resolve, reject) => {
			client.shell(
				{
					term: "xterm-256color",
					cols: options.cols,
					rows: options.rows,
				},
				{ env: options.env },
				(err, channel) => {
					if (err) {
						reject(err);
						return;
					}

					const session: SshSessionInfo = {
						paneId,
						hostId,
						channel,
						cwd: options.cwd ?? "",
						createdAt: Date.now(),
					};
					this.sessions.set(paneId, session);

					channel.on("data", (data: Buffer) => {
						this.emit("session-data", paneId, data);
					});

					channel.stderr.on("data", (data: Buffer) => {
						this.emit("session-data", paneId, data);
					});

					channel.on("close", (code: number | null, signal?: string) => {
						this.sessions.delete(paneId);
						this.emit("session-exit", paneId, code, signal);
					});

					// If a working directory was requested, cd into it first
					if (options.cwd) {
						channel.stdin.write(`cd ${shellEscape(options.cwd)}\n`);
					}

					resolve();
				},
			);
		});
	}

	/** Write data to a session channel's stdin. */
	writeToSession(paneId: string, data: string): void {
		const session = this.sessions.get(paneId);
		if (!session) {
			console.warn(
				`[SshConnectionManager] writeToSession: session ${paneId} not found`,
			);
			return;
		}
		session.channel.stdin.write(data);
	}

	/** Resize the PTY for a session by sending a window-change request. */
	resizeSession(paneId: string, cols: number, rows: number): void {
		const session = this.sessions.get(paneId);
		if (!session) {
			console.warn(
				`[SshConnectionManager] resizeSession: session ${paneId} not found`,
			);
			return;
		}
		// ClientChannel exposes setWindow for PTY resize
		(
			session.channel as ClientChannel & {
				setWindow(
					rows: number,
					cols: number,
					height: number,
					width: number,
				): void;
			}
		).setWindow(rows, cols, 0, 0);
	}

	/** Send a signal to a session channel (e.g. SIGINT). */
	signalSession(paneId: string, signal = "INT"): void {
		const session = this.sessions.get(paneId);
		if (!session) {
			console.warn(
				`[SshConnectionManager] signalSession: session ${paneId} not found`,
			);
			return;
		}
		session.channel.signal(signal);
	}

	/** Close a session channel. */
	closeSession(paneId: string): void {
		const session = this.sessions.get(paneId);
		if (!session) return;
		try {
			session.channel.close();
		} catch {
			// ignore
		}
		this.sessions.delete(paneId);
	}

	/** Get session info for a pane, or null if not found. */
	getSession(paneId: string): SshSessionInfo | null {
		return this.sessions.get(paneId) ?? null;
	}

	/** Get all sessions belonging to a given host. */
	getSessionsByHost(hostId: string): SshSessionInfo[] {
		return Array.from(this.sessions.values()).filter(
			(s) => s.hostId === hostId,
		);
	}

	// -------------------------------------------------------------------
	// SFTP
	// -------------------------------------------------------------------

	/**
	 * Get an SFTP subsystem client for the given host.
	 * Clients are cached per connection — a new one is created if the cache is empty.
	 */
	async getSftpClient(hostId: string): Promise<SFTPWrapper> {
		const cached = this.sftpClients.get(hostId);
		if (cached) return cached;

		const client = this.getConnection(hostId);
		if (!client) {
			throw new Error(`[SshConnectionManager] Host ${hostId} is not connected`);
		}

		return new Promise<SFTPWrapper>((resolve, reject) => {
			client.sftp((err, sftp) => {
				if (err) {
					reject(err);
					return;
				}
				this.sftpClients.set(hostId, sftp);

				sftp.on("end", () => {
					this.sftpClients.delete(hostId);
				});
				sftp.on("error", () => {
					this.sftpClients.delete(hostId);
				});

				resolve(sftp);
			});
		});
	}

	// -------------------------------------------------------------------
	// Test connectivity
	// -------------------------------------------------------------------

	/**
	 * Test connectivity to a host without persisting the connection.
	 * Returns success/error without modifying internal state.
	 */
	async testConnection(
		config: SshHostConfig,
		credentials?: { password?: string; passphrase?: string },
	): Promise<{ success: boolean; error?: string }> {
		return new Promise<{ success: boolean; error?: string }>((resolve) => {
			const client = new Client();
			let settled = false;

			const done = (success: boolean, error?: string) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutHandle);
				try {
					client.end();
				} catch {
					// ignore
				}
				resolve({ success, error });
			};

			const timeoutHandle = setTimeout(() => {
				done(false, "Connection timed out");
			}, 15000);

			client.on("ready", () => done(true));
			client.on("error", (err: Error) => done(false, err.message));

			this.buildConnectConfig(config, credentials)
				.then((connectConfig) => {
					client.connect(connectConfig);
				})
				.catch((err: Error) => {
					done(false, err.message);
				});
		});
	}

	// -------------------------------------------------------------------
	// Cleanup
	// -------------------------------------------------------------------

	/** Close all connections and sessions. */
	async cleanup(): Promise<void> {
		for (const timer of this.reconnectTimers.values()) {
			clearTimeout(timer);
		}
		this.reconnectTimers.clear();

		for (const session of this.sessions.values()) {
			try {
				session.channel.close();
			} catch {
				// ignore
			}
		}
		this.sessions.clear();

		for (const sftp of this.sftpClients.values()) {
			try {
				sftp.end();
			} catch {
				// ignore
			}
		}
		this.sftpClients.clear();

		for (const info of this.connections.values()) {
			try {
				info.client?.end();
			} catch {
				// ignore
			}
		}
		this.connections.clear();

		this.removeAllListeners();
	}

	// -------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------

	private setState(
		hostId: string,
		state: SshConnectionState,
		error?: string,
	): void {
		const existing = this.connections.get(hostId);
		if (existing) {
			existing.state = state;
			if (error !== undefined) existing.error = error;
		}
		this.emit("state-change", hostId, state, error);
	}

	private handleDisconnect(config: SshHostConfig): void {
		const info = this.connections.get(config.id);
		if (!info) return;

		// Clear stale SFTP client so next getSftpClient() opens a fresh one
		this.sftpClients.delete(config.id);

		if (info.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			console.error(
				`[SshConnectionManager] Max reconnect attempts reached for ${config.id}`,
			);
			this.setState(config.id, "error", "Max reconnect attempts exceeded");
			return;
		}

		info.reconnectAttempts += 1;
		const delay = RECONNECT_BASE_MS * 2 ** (info.reconnectAttempts - 1);

		console.warn(
			`[SshConnectionManager] Reconnecting to ${config.id} in ${delay}ms (attempt ${info.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
		);

		this.setState(config.id, "reconnecting");

		const timer = setTimeout(() => {
			this.reconnectTimers.delete(config.id);
			this.connect(config).catch((err: Error) => {
				console.error(
					`[SshConnectionManager] Reconnect failed for ${config.id}:`,
					err.message,
				);
			});
		}, delay);

		this.reconnectTimers.set(config.id, timer);
	}

	private clearReconnectTimer(hostId: string): void {
		const timer = this.reconnectTimers.get(hostId);
		if (timer) {
			clearTimeout(timer);
			this.reconnectTimers.delete(hostId);
		}
	}

	private async buildConnectConfig(
		config: SshHostConfig,
		credentials?: { password?: string; passphrase?: string },
	): Promise<Parameters<InstanceType<typeof Client>["connect"]>[0]> {
		const base = {
			host: config.hostname,
			port: config.port,
			username: config.username,
		};

		switch (config.authMethod) {
			case "password":
				return {
					...base,
					password: credentials?.password ?? "",
				};

			case "privateKey": {
				if (!config.privateKeyPath) {
					throw new Error(
						`[SshConnectionManager] No privateKeyPath configured for host ${config.id}`,
					);
				}
				const privateKey = await fs.readFile(config.privateKeyPath);
				return {
					...base,
					privateKey,
					passphrase: credentials?.passphrase,
				};
			}

			case "agent":
				return {
					...base,
					agent: process.env.SSH_AUTH_SOCK,
				};

			default:
				throw new Error(
					`[SshConnectionManager] Unknown authMethod: ${config.authMethod}`,
				);
		}
	}
}
