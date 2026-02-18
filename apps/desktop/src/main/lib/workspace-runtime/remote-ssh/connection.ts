/**
 * SSH Connection
 *
 * Wraps ssh2.Client with connect/disconnect lifecycle, keepalive,
 * auto-reconnect, and convenience methods for shell/exec/sftp.
 */

import { EventEmitter } from "node:events";
import type { Client, ClientChannel, ConnectConfig, SFTPWrapper } from "ssh2";
import {
	defaultReconnectStrategy,
	type ReconnectStrategy,
	waitForReconnect,
} from "./reconnect-strategy";
import { resolveSSHAuth } from "./ssh-key-resolver";
import type { SSHConnectionState, SSHHostConfig } from "./types";

const KEEPALIVE_INTERVAL = 30_000;
const KEEPALIVE_COUNT_MAX = 3;

export interface SSHConnectionEvents {
	connected: [];
	disconnected: [error?: Error];
	reconnecting: [attempt: number];
	error: [error: Error];
	stateChange: [state: SSHConnectionState];
}

export class SSHConnection extends EventEmitter {
	private client: Client | null = null;
	private _state: SSHConnectionState = { status: "disconnected" };
	private connectInFlight: Promise<void> | null = null;
	private reconnectAbort: AbortController | null = null;
	private intentionalDisconnect = false;

	readonly config: SSHHostConfig;
	private readonly reconnectStrategy: ReconnectStrategy;

	constructor(
		config: SSHHostConfig,
		reconnectStrategy: ReconnectStrategy = defaultReconnectStrategy,
	) {
		super();
		this.config = config;
		this.reconnectStrategy = reconnectStrategy;
	}

	get state(): SSHConnectionState {
		return this._state;
	}

	get isConnected(): boolean {
		return this._state.status === "connected";
	}

	private setState(state: SSHConnectionState): void {
		this._state = state;
		this.emit("stateChange", state);
	}

	/**
	 * Establish the SSH connection.
	 */
	async connect(): Promise<void> {
		if (this._state.status === "connected") return;
		if (this.connectInFlight) return this.connectInFlight;

		// If a background reconnect loop is already active, wait for its outcome
		// instead of starting a second parallel connection attempt.
		if (this._state.status === "reconnecting") {
			await this.waitForReconnectResult();
			return;
		}

		this.intentionalDisconnect = false;
		this.setState({ status: "connecting" });

		const attempt = (async () => {
			try {
				this.client = await this.createClient();
				this.setState({ status: "connected" });
				this.emit("connected");
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				this.setState({
					status: "disconnected",
					lastError: error.message,
				});
				this.emit("error", error);
				throw error;
			}
		})();

		this.connectInFlight = attempt.finally(() => {
			this.connectInFlight = null;
		});

		await this.connectInFlight;
	}

	/**
	 * Disconnect and stop any reconnection attempts.
	 */
	disconnect(): void {
		this.intentionalDisconnect = true;
		this.reconnectAbort?.abort();
		this.reconnectAbort = null;

		if (this.client) {
			this.client.end();
			this.client = null;
		}

		this.setState({ status: "disconnected" });
		this.emit("disconnected");
	}

	/**
	 * Open a PTY shell channel.
	 */
	async openShell(
		cols: number,
		rows: number,
		env?: Record<string, string>,
	): Promise<ClientChannel> {
		const client = this.ensureConnected();
		return new Promise((resolve, reject) => {
			client.shell(
				{
					term: "xterm-256color",
					cols,
					rows,
				},
				{ env },
				(err, stream) => {
					if (err) return reject(err);
					resolve(stream);
				},
			);
		});
	}

	/**
	 * Execute a command on the remote host.
	 */
	async exec(
		command: string,
		cwd?: string,
	): Promise<{ stdout: string; stderr: string; code: number }> {
		const client = this.ensureConnected();
		const fullCommand = cwd
			? `cd ${escapeShellArg(cwd)} && ${command}`
			: command;

		return new Promise((resolve, reject) => {
			client.exec(fullCommand, (err, stream) => {
				if (err) return reject(err);

				let stdout = "";
				let stderr = "";

				stream.on("data", (data: Buffer) => {
					stdout += data.toString();
				});
				stream.stderr.on("data", (data: Buffer) => {
					stderr += data.toString();
				});
				stream.on("close", (code: number) => {
					resolve({ stdout, stderr, code: code ?? 0 });
				});
				stream.on("error", reject);
			});
		});
	}

	/**
	 * Get an SFTP client.
	 */
	async getSftp(): Promise<SFTPWrapper> {
		const client = this.ensureConnected();
		return new Promise((resolve, reject) => {
			client.sftp((err, sftp) => {
				if (err) return reject(err);
				resolve(sftp);
			});
		});
	}

	/**
	 * Get the underlying ssh2.Client (for direct usage when needed).
	 */
	getClient(): Client {
		return this.ensureConnected();
	}

	private ensureConnected(): Client {
		if (!this.client || this._state.status !== "connected") {
			throw new Error("SSH connection is not established");
		}
		return this.client;
	}

	private createClient(): Promise<Client> {
		const { Client: SSH2Client } = require("ssh2") as typeof import("ssh2");
		const client = new SSH2Client();

		const auth = resolveSSHAuth({
			identityFile: this.config.identityFile,
			useAgent: this.config.useAgent,
		});

		const connectConfig: ConnectConfig = {
			host: this.config.host,
			port: this.config.port,
			username: this.config.username,
			keepaliveInterval: KEEPALIVE_INTERVAL,
			keepaliveCountMax: KEEPALIVE_COUNT_MAX,
			readyTimeout: 30_000,
		};

		if (auth.agent) {
			connectConfig.agent = auth.agent;
		} else if (auth.privateKey) {
			connectConfig.privateKey = auth.privateKey;
		}

		return new Promise((resolve, reject) => {
			const onReady = () => {
				cleanup();
				resolve(client);
			};

			const onError = (err: Error) => {
				cleanup();
				reject(err);
			};

			const cleanup = () => {
				client.removeListener("ready", onReady);
				client.removeListener("error", onError);
			};

			client.once("ready", onReady);
			client.once("error", onError);

			// Wire up persistent event handlers
			client.on("close", () => {
				if (this._state.status === "connected" && !this.intentionalDisconnect) {
					this.handleUnexpectedDisconnect();
				}
			});

			client.on("error", (err: Error) => {
				if (this._state.status === "connected") {
					this.emit("error", err);
				}
			});

			client.connect(connectConfig);
		});
	}

	private handleUnexpectedDisconnect(): void {
		this.client = null;
		this.emit("disconnected", new Error("Connection lost"));

		// Start reconnection
		this.reconnectAbort?.abort();
		this.reconnectAbort = new AbortController();
		void this.reconnectLoop(this.reconnectAbort.signal);
	}

	private waitForReconnectResult(timeoutMs = 35_000): Promise<void> {
		if (this._state.status === "connected") return Promise.resolve();

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error("Timed out waiting for SSH reconnection"));
			}, timeoutMs);

			const onConnected = () => {
				cleanup();
				resolve();
			};

			const onStateChange = (state: SSHConnectionState) => {
				if (state.status === "disconnected") {
					cleanup();
					reject(new Error(state.lastError || "SSH reconnection failed"));
				}
			};

			const cleanup = () => {
				clearTimeout(timeout);
				this.removeListener("connected", onConnected);
				this.removeListener("stateChange", onStateChange);
			};

			this.on("connected", onConnected);
			this.on("stateChange", onStateChange);
		});
	}

	private async reconnectLoop(signal: AbortSignal): Promise<void> {
		for (
			let attempt = 0;
			attempt < this.reconnectStrategy.maxAttempts;
			attempt++
		) {
			if (signal.aborted || this.intentionalDisconnect) return;

			this.setState({
				status: "reconnecting",
				reconnectAttempt: attempt + 1,
			});
			this.emit("reconnecting", attempt + 1);

			try {
				await waitForReconnect(attempt, this.reconnectStrategy, signal);
				if (signal.aborted) return;

				this.client = await this.createClient();
				this.setState({ status: "connected" });
				this.emit("connected");
				return;
			} catch {
				// Continue to next attempt
			}
		}

		// All attempts exhausted
		this.setState({
			status: "disconnected",
			lastError: `Failed to reconnect after ${this.reconnectStrategy.maxAttempts} attempts`,
		});
	}
}

function escapeShellArg(arg: string): string {
	return `'${arg.replace(/'/g, "'\\''")}'`;
}
