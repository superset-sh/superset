/**
 * SSH Client
 *
 * Manages SSH connections to remote servers using ssh2 library.
 * Handles connection lifecycle, authentication, and reconnection.
 */

import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import type {
	SSHConnectionConfig,
	SSHConnectionState,
	SSHConnectionStatus,
} from "./types";

const DEFAULT_PORT = 22;
const DEFAULT_KEEPALIVE_INTERVAL = 60;
const DEFAULT_CONNECTION_TIMEOUT = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

export class SSHClient extends EventEmitter {
	private client: Client;
	private config: SSHConnectionConfig;
	private state: SSHConnectionState = "disconnected";
	private reconnectAttempts = 0;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private channels: Map<string, ClientChannel> = new Map();

	constructor(config: SSHConnectionConfig) {
		super();
		this.config = config;
		this.client = new Client();
		this.setupClientHandlers();
	}

	private setupClientHandlers(): void {
		this.client.on("ready", () => {
			console.log(`[ssh/client] Connected to ${this.config.host}`);
			this.state = "connected";
			this.reconnectAttempts = 0;
			this.emitStatus();
		});

		this.client.on("error", (err) => {
			console.error(`[ssh/client] Connection error:`, err.message);
			this.state = "error";
			this.emitStatus(err.message);
			this.attemptReconnect();
		});

		this.client.on("close", () => {
			console.log(`[ssh/client] Connection closed`);
			const wasConnected = this.state === "connected";
			this.state = "disconnected";
			this.emitStatus();

			// Clean up all channels
			for (const [paneId, channel] of this.channels) {
				channel.destroy();
				this.emit(`exit:${paneId}`, 1, undefined);
			}
			this.channels.clear();

			// Attempt reconnect if was previously connected
			if (wasConnected) {
				this.attemptReconnect();
			}
		});

		this.client.on("end", () => {
			console.log(`[ssh/client] Connection ended`);
			this.state = "disconnected";
			this.emitStatus();
		});

		this.client.on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
			// For keyboard-interactive auth, we don't support password prompts here
			// This would require UI integration
			console.warn(
				"[ssh/client] Keyboard-interactive auth requested but not supported",
			);
			finish([]);
		});
	}

	private emitStatus(error?: string): void {
		const status: SSHConnectionStatus = {
			state: this.state,
			error,
			reconnectAttempt:
				this.state === "reconnecting" ? this.reconnectAttempts : undefined,
		};
		this.emit("connectionStatus", status);
	}

	private attemptReconnect(): void {
		if (this.reconnectTimer) {
			return;
		}

		if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			console.log(`[ssh/client] Max reconnect attempts reached`);
			this.state = "error";
			this.emitStatus("Max reconnect attempts reached");
			return;
		}

		this.state = "reconnecting";
		this.reconnectAttempts++;
		this.emitStatus();

		console.log(
			`[ssh/client] Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${this.reconnectAttempts})`,
		);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect().catch((err) => {
				console.error(`[ssh/client] Reconnect failed:`, err.message);
			});
		}, RECONNECT_DELAY_MS);
	}

	async connect(): Promise<void> {
		if (this.state === "connected" || this.state === "connecting") {
			console.log(`[ssh/client] Already ${this.state}, skipping connect`);
			return;
		}

		console.log(`[ssh/client] Connecting to ${this.config.host}:${this.config.port} as ${this.config.username}`);
		this.state = "connecting";
		this.emitStatus();

		let connectConfig: ConnectConfig;
		try {
			connectConfig = await this.buildConnectConfig();
			console.log(`[ssh/client] Auth method: ${this.config.authMethod}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[ssh/client] Failed to build connect config: ${message}`);
			this.state = "error";
			this.emitStatus(message);
			throw err;
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				console.error(`[ssh/client] Connection timeout after ${this.config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT}ms`);
				this.client.end();
				reject(new Error("Connection timeout"));
			}, this.config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT);

			this.client.once("ready", () => {
				clearTimeout(timeout);
				console.log(`[ssh/client] Connection ready`);
				resolve();
			});

			this.client.once("error", (err) => {
				clearTimeout(timeout);
				console.error(`[ssh/client] Connection error: ${err.message}`);
				reject(err);
			});

			this.client.connect(connectConfig);
		});
	}

	private async buildConnectConfig(): Promise<ConnectConfig> {
		const config: ConnectConfig = {
			host: this.config.host,
			port: this.config.port ?? DEFAULT_PORT,
			username: this.config.username,
			keepaliveInterval:
				(this.config.keepAliveInterval ?? DEFAULT_KEEPALIVE_INTERVAL) * 1000,
			keepaliveCountMax: 3,
			readyTimeout: this.config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
			agentForward: this.config.agentForward,
		};

		switch (this.config.authMethod) {
			case "key": {
				let keyPath = this.config.privateKeyPath;

				// If no key path specified, try common default locations
				if (!keyPath) {
					const sshDir = path.join(os.homedir(), ".ssh");
					// Try id_ed25519 first (more common now), then id_rsa
					const defaultKeys = ["id_ed25519", "id_rsa", "id_ecdsa"];
					for (const keyName of defaultKeys) {
						const candidatePath = path.join(sshDir, keyName);
						if (fs.existsSync(candidatePath)) {
							keyPath = candidatePath;
							break;
						}
					}
					if (!keyPath) {
						keyPath = path.join(sshDir, "id_rsa"); // Fallback for error message
					}
				}

				// Expand ~ to home directory (handles Unix-style paths in config files)
				if (keyPath.startsWith("~")) {
					keyPath = keyPath.replace(/^~[/\\]?/, os.homedir() + path.sep);
				}
				console.log(`[ssh/client] Reading private key from: ${keyPath}`);
				try {
					config.privateKey = fs.readFileSync(keyPath);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Failed to read private key at ${keyPath}: ${message}`);
				}
				break;
			}
			case "agent": {
				// Use SSH agent - platform-specific handling
				if (process.platform === "win32") {
					// Windows: OpenSSH agent uses a named pipe
					// Check for OpenSSH agent pipe (Windows 10+)
					const opensshPipe = "\\\\.\\pipe\\openssh-ssh-agent";
					config.agent = opensshPipe;
					console.log(`[ssh/client] Using Windows OpenSSH agent pipe: ${opensshPipe}`);
				} else {
					// Unix/macOS: Use SSH_AUTH_SOCK environment variable
					config.agent = process.env.SSH_AUTH_SOCK;
					if (!config.agent) {
						throw new Error("SSH agent not available (SSH_AUTH_SOCK not set)");
					}
				}
				break;
			}
			case "password": {
				// Password would need to be passed securely
				// For now, we rely on key or agent auth
				throw new Error(
					"Password authentication not implemented - use key or agent auth",
				);
			}
		}

		return config;
	}

	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent reconnect
		this.client.end();
	}

	isConnected(): boolean {
		return this.state === "connected";
	}

	getState(): SSHConnectionState {
		return this.state;
	}

	/**
	 * Create a PTY channel for a terminal session
	 */
	async createPtyChannel({
		paneId,
		cols,
		rows,
		cwd,
	}: {
		paneId: string;
		cols: number;
		rows: number;
		cwd?: string;
	}): Promise<ClientChannel> {
		if (!this.isConnected()) {
			throw new Error("SSH client not connected");
		}

		return new Promise((resolve, reject) => {
			const ptyOptions = {
				term: process.env.TERM || "xterm-256color",
				cols,
				rows,
				modes: {},
			};

			this.client.shell(ptyOptions, (err, channel) => {
				if (err) {
					reject(err);
					return;
				}

				this.channels.set(paneId, channel);

				// Set up channel event handlers
				channel.on("data", (data: Buffer) => {
					this.emit(`data:${paneId}`, data.toString());
				});

				channel.stderr.on("data", (data: Buffer) => {
					this.emit(`data:${paneId}`, data.toString());
				});

				channel.on("close", () => {
					this.channels.delete(paneId);
					this.emit(`exit:${paneId}`, 0, undefined);
				});

				channel.on("error", (err: Error) => {
					console.error(`[ssh/client] Channel error for ${paneId}:`, err.message);
					this.emit(`error:${paneId}`, err.message);
				});

				// Change directory if specified
				if (cwd) {
					channel.write(`cd ${JSON.stringify(cwd)} && clear\n`);
				}

				resolve(channel);
			});
		});
	}

	/**
	 * Write data to a PTY channel
	 */
	write(paneId: string, data: string): void {
		const channel = this.channels.get(paneId);
		if (channel) {
			channel.write(data);
		}
	}

	/**
	 * Resize a PTY channel
	 */
	resize(paneId: string, cols: number, rows: number): void {
		const channel = this.channels.get(paneId);
		if (channel) {
			channel.setWindow(rows, cols, 0, 0);
		}
	}

	/**
	 * Send a signal to a PTY channel
	 */
	signal(paneId: string, signalName: string): void {
		const channel = this.channels.get(paneId);
		if (channel) {
			channel.signal(signalName);
		}
	}

	/**
	 * Kill/close a PTY channel
	 */
	killChannel(paneId: string): void {
		const channel = this.channels.get(paneId);
		if (channel) {
			channel.close();
			this.channels.delete(paneId);
		}
	}

	/**
	 * Check if a channel exists and is alive
	 */
	hasChannel(paneId: string): boolean {
		return this.channels.has(paneId);
	}

	/**
	 * Get all active channel pane IDs
	 */
	getChannelIds(): string[] {
		return Array.from(this.channels.keys());
	}
}
