import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";

/**
 * Parsed SSH config host entry
 */
export interface SSHConfigHost {
	name: string; // The Host alias (e.g., "myserver")
	hostName?: string; // The actual hostname/IP
	user?: string;
	port?: number;
	identityFile?: string;
}

/**
 * Parses ~/.ssh/config and returns a list of configured hosts
 */
export async function parseSSHConfig(): Promise<SSHConfigHost[]> {
	const configPath = path.join(os.homedir(), ".ssh", "config");

	if (!existsSync(configPath)) {
		return [];
	}

	try {
		const content = await readFile(configPath, "utf-8");
		return parseSSHConfigContent(content);
	} catch {
		return [];
	}
}

/**
 * Parses SSH config file content
 */
function parseSSHConfigContent(content: string): SSHConfigHost[] {
	const hosts: SSHConfigHost[] = [];
	let currentHost: SSHConfigHost | null = null;

	const lines = content.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		// Parse key-value pairs (handles both "Key Value" and "Key=Value")
		const match = trimmed.match(/^(\S+)\s*[=\s]\s*(.+)$/);
		if (!match) {
			continue;
		}

		const [, key, value] = match;
		const keyLower = key.toLowerCase();

		if (keyLower === "host") {
			// Save previous host if exists
			if (currentHost && currentHost.name !== "*") {
				hosts.push(currentHost);
			}

			// Start new host (skip wildcards)
			const hostName = value.trim();
			if (hostName.includes("*") || hostName.includes("?")) {
				currentHost = null;
			} else {
				currentHost = { name: hostName };
			}
		} else if (currentHost) {
			// Add properties to current host
			switch (keyLower) {
				case "hostname":
					currentHost.hostName = value.trim();
					break;
				case "user":
					currentHost.user = value.trim();
					break;
				case "port":
					currentHost.port = Number.parseInt(value.trim(), 10) || 22;
					break;
				case "identityfile":
					// Expand ~ in identity file path
					currentHost.identityFile = value.trim().replace(/^~/, os.homedir());
					break;
			}
		}
	}

	// Don't forget the last host
	if (currentHost && currentHost.name !== "*") {
		hosts.push(currentHost);
	}

	return hosts;
}

/**
 * Escapes a string for safe use in a single-quoted shell argument.
 * Single quotes are ended, escaped, and reopened: ' -> '\''
 */
function shellEscape(str: string): string {
	return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Validates that a path doesn't contain dangerous control characters.
 * Returns true if the path is safe, false otherwise.
 */
function isPathSafe(path: string): boolean {
	// Reject paths with control characters (ASCII 0-31, except tab which is rarely used in paths)
	// Also reject DEL (127) and any non-printable characters
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally detecting control chars
	const controlCharRegex = /[\x00-\x08\x0a-\x1f\x7f]/;
	return !controlCharRegex.test(path);
}

/**
 * Builds a safe cd command that handles tilde expansion.
 * - "~" becomes: cd -- ~
 * - "~/foo" becomes: cd -- ~/'foo' (tilde expanded, rest escaped)
 * - "/absolute/path" becomes: cd -- '/absolute/path'
 * Returns null if the path contains dangerous characters.
 * Always uses -- to prevent option parsing (e.g. ~/--work).
 */
function buildCdCommand(path: string): string | null {
	const trimmed = path.trim();

	if (!isPathSafe(trimmed)) {
		return null;
	}

	if (trimmed === "~") {
		return "cd -- ~";
	}

	if (trimmed.startsWith("~/")) {
		// Split off the tilde, escape the rest
		// Use -- to prevent paths like ~/--work from being parsed as options
		const rest = trimmed.slice(2);
		if (rest === "") {
			return "cd -- ~";
		}
		return `cd -- ~/${shellEscape(rest)}`;
	}

	// Regular path - fully escape it
	return `cd -- ${shellEscape(trimmed)}`;
}

export interface SSHCredentials {
	host: string;
	port: number;
	username: string;
	authMethod: "key" | "password";
	privateKeyPath?: string;
	password?: string;
	passphrase?: string;
}

interface SSHSession {
	client: Client;
	shell: ClientChannel | null;
	paneId: string;
	connectionId: string;
	cols: number;
	rows: number;
	lastActive: number;
	scrollback: string;
	isConnected: boolean;
	remoteCwd: string;
}

export interface SSHDataEvent {
	type: "data";
	data: string;
}

export interface SSHExitEvent {
	type: "exit";
	exitCode: number;
}

export interface SSHErrorEvent {
	type: "error";
	message: string;
}

export type SSHEvent = SSHDataEvent | SSHExitEvent | SSHErrorEvent;

export class SSHManager extends EventEmitter {
	private sessions = new Map<string, SSHSession>();
	private connections = new Map<string, Client>();
	private readonly DEFAULT_COLS = 80;
	private readonly DEFAULT_ROWS = 24;

	async connect(params: {
		connectionId: string;
		credentials: SSHCredentials;
	}): Promise<{ success: boolean; error?: string }> {
		const { connectionId, credentials } = params;

		// Check if already connected
		if (this.connections.has(connectionId)) {
			const existing = this.connections.get(connectionId);
			if (existing) {
				return { success: true };
			}
		}

		// Read private key before setting up Promise (avoid async executor)
		let privateKey: Buffer | undefined;
		try {
			if (credentials.authMethod === "key" && credentials.privateKeyPath) {
				const keyPath = credentials.privateKeyPath.replace(/^~/, os.homedir());
				privateKey = await readFile(keyPath);
			}
		} catch (err) {
			return {
				success: false,
				error:
					err instanceof Error ? err.message : "Failed to read private key",
			};
		}

		const client = new Client();

		return new Promise((resolve) => {
			let resolved = false;

			client.on("ready", () => {
				if (!resolved) {
					resolved = true;
					this.connections.set(connectionId, client);
					resolve({ success: true });
				}
			});

			client.on("error", (err) => {
				if (!resolved) {
					resolved = true;
					resolve({ success: false, error: err.message });
				} else {
					this.emit(`error:${connectionId}`, err.message);
				}
			});

			client.on("close", () => {
				// Collect sessions to clean up first (avoid modifying map while iterating)
				const sessionsToCleanup: Array<{ tabId: string; session: SSHSession }> =
					[];
				for (const [tabId, session] of this.sessions.entries()) {
					if (session.connectionId === connectionId) {
						sessionsToCleanup.push({ tabId, session });
					}
				}

				// Clean up all sessions using this connection
				for (const { tabId, session } of sessionsToCleanup) {
					if (session.shell) {
						session.shell.removeAllListeners();
						// Don't call shell.close() - the connection is already closed
					}
					session.isConnected = false;
					this.sessions.delete(tabId);
					this.emit(`exit:${tabId}`, 0);
				}

				// Finally remove the connection from our map
				this.connections.delete(connectionId);
			});

			client.connect({
				host: credentials.host,
				port: credentials.port,
				username: credentials.username,
				privateKey,
				passphrase: credentials.passphrase,
				password: credentials.password,
				readyTimeout: 30000,
				keepaliveInterval: 10000,
			});
		});
	}

	async testConnection(
		credentials: SSHCredentials,
	): Promise<{ success: boolean; error?: string }> {
		// Read private key before setting up Promise (avoid async executor)
		let privateKey: Buffer | undefined;
		try {
			if (credentials.authMethod === "key" && credentials.privateKeyPath) {
				const keyPath = credentials.privateKeyPath.replace(/^~/, os.homedir());
				privateKey = await readFile(keyPath);
			}
		} catch (err) {
			return {
				success: false,
				error:
					err instanceof Error ? err.message : "Failed to read private key",
			};
		}

		const client = new Client();

		return new Promise((resolve) => {
			let resolved = false;
			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					client.end();
					resolve({ success: false, error: "Connection timeout" });
				}
			}, 15000);

			client.on("ready", () => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					client.end();
					resolve({ success: true });
				}
			});

			client.on("error", (err) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					resolve({ success: false, error: err.message });
				}
			});

			client.connect({
				host: credentials.host,
				port: credentials.port,
				username: credentials.username,
				privateKey,
				passphrase: credentials.passphrase,
				password: credentials.password,
				readyTimeout: 15000,
			});
		});
	}

	disconnect(connectionId: string): void {
		// Collect sessions to clean up first (avoid modifying map while iterating)
		const sessionsToCleanup: Array<{ tabId: string; session: SSHSession }> = [];
		for (const [tabId, session] of this.sessions.entries()) {
			if (session.connectionId === connectionId) {
				sessionsToCleanup.push({ tabId, session });
			}
		}

		// Close all sessions using this connection
		for (const { tabId, session } of sessionsToCleanup) {
			if (session.shell) {
				session.shell.removeAllListeners();
				session.shell.close();
			}
			session.isConnected = false;
			this.sessions.delete(tabId);
			this.emit(`exit:${tabId}`, 0);
		}

		// Then close the connection
		const client = this.connections.get(connectionId);
		if (client) {
			client.end();
			this.connections.delete(connectionId);
		}
	}

	isConnected(connectionId: string): boolean {
		return this.connections.has(connectionId);
	}

	async createShell(params: {
		paneId: string;
		connectionId: string;
		cwd?: string;
		cols?: number;
		rows?: number;
	}): Promise<{
		success: boolean;
		error?: string;
		scrollback?: string;
	}> {
		const { paneId, connectionId, cwd, cols, rows } = params;

		const client = this.connections.get(connectionId);
		if (!client) {
			return { success: false, error: "Not connected" };
		}

		// Check for existing session
		const existing = this.sessions.get(paneId);
		if (existing?.isConnected) {
			return { success: true, scrollback: existing.scrollback };
		}

		const terminalCols = cols || this.DEFAULT_COLS;
		const terminalRows = rows || this.DEFAULT_ROWS;

		return new Promise((resolve) => {
			client.shell(
				{
					term: "xterm-256color",
					cols: terminalCols,
					rows: terminalRows,
				},
				(err, stream) => {
					if (err) {
						resolve({ success: false, error: err.message });
						return;
					}

					const session: SSHSession = {
						client,
						shell: stream,
						paneId,
						connectionId,
						cols: terminalCols,
						rows: terminalRows,
						lastActive: Date.now(),
						scrollback: "",
						isConnected: true,
						remoteCwd: cwd || "~",
					};

					stream.on("data", (data: Buffer) => {
						const str = data.toString("utf8");
						session.scrollback += str;
						session.lastActive = Date.now();
						this.emit(`data:${paneId}`, str);
					});

					stream.stderr?.on("data", (data: Buffer) => {
						const str = data.toString("utf8");
						session.scrollback += str;
						this.emit(`data:${paneId}`, str);
					});

					stream.on("close", () => {
						session.isConnected = false;
						this.emit(`exit:${paneId}`, 0);
						this.sessions.delete(paneId);
					});

					stream.on("error", (err: Error) => {
						this.emit(`error:${paneId}`, err.message);
					});

					this.sessions.set(paneId, session);

					// Change to the requested directory if specified
					if (cwd && cwd !== "~") {
						const cdCommand = buildCdCommand(cwd);
						if (cdCommand) {
							stream.write(`${cdCommand}\n`);
						}
						// If cdCommand is null, the path contains control characters - skip it silently
						// The shell will start in the default directory
					}

					resolve({ success: true, scrollback: "" });
				},
			);
		});
	}

	write(params: { paneId: string; data: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session?.shell || !session.isConnected) {
			throw new Error(
				`SSH session ${params.paneId} not found or not connected`,
			);
		}

		session.shell.write(params.data);
		session.lastActive = Date.now();
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const session = this.sessions.get(params.paneId);
		if (!session?.shell || !session.isConnected) {
			console.warn(
				`Cannot resize SSH session ${params.paneId}: not found or not connected`,
			);
			return;
		}

		session.shell.setWindow(params.rows, params.cols, 0, 0);
		session.cols = params.cols;
		session.rows = params.rows;
		session.lastActive = Date.now();
	}

	signal(params: { paneId: string; signal?: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session?.shell || !session.isConnected) {
			console.warn(
				`Cannot signal SSH session ${params.paneId}: not found or not connected`,
			);
			return;
		}

		// SSH doesn't have direct signal support like PTY,
		// but we can send Ctrl+C for SIGINT
		if (params.signal === "SIGINT") {
			session.shell.write("\x03");
		} else if (params.signal === "SIGTERM") {
			// Close the shell
			session.shell.close();
		}
	}

	async kill(params: { paneId: string }): Promise<void> {
		const session = this.sessions.get(params.paneId);
		if (!session) {
			return;
		}

		if (session.shell) {
			session.shell.removeAllListeners();
			session.shell.close();
		}
		session.isConnected = false;
		this.emit(`exit:${params.paneId}`, 0);
		this.sessions.delete(params.paneId);
	}

	getSession(paneId: string): {
		isConnected: boolean;
		connectionId: string;
		lastActive: number;
	} | null {
		const session = this.sessions.get(paneId);
		if (!session) {
			return null;
		}

		return {
			isConnected: session.isConnected,
			connectionId: session.connectionId,
			lastActive: session.lastActive,
		};
	}

	async executeCommand(params: {
		connectionId: string;
		command: string;
	}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		const client = this.connections.get(params.connectionId);
		if (!client) {
			throw new Error("Not connected");
		}

		return new Promise((resolve, reject) => {
			client.exec(params.command, (err, stream) => {
				if (err) {
					reject(err);
					return;
				}

				let stdout = "";
				let stderr = "";

				stream.on("data", (data: Buffer) => {
					stdout += data.toString("utf8");
				});

				stream.stderr.on("data", (data: Buffer) => {
					stderr += data.toString("utf8");
				});

				stream.on("close", (code: number) => {
					resolve({ stdout, stderr, exitCode: code ?? 0 });
				});

				stream.on("error", (err: Error) => {
					reject(err);
				});
			});
		});
	}

	/**
	 * Gets an SFTP session for a connection.
	 * SFTP is more reliable than parsing ls output for file operations.
	 */
	private getSftp(connectionId: string): Promise<SFTPWrapper> {
		const client = this.connections.get(connectionId);
		if (!client) {
			return Promise.reject(new Error("Not connected"));
		}

		return new Promise((resolve, reject) => {
			client.sftp((err, sftp) => {
				if (err) {
					reject(err);
				} else {
					resolve(sftp);
				}
			});
		});
	}

	/**
	 * Expands a path that may start with ~ to use the actual home directory.
	 */
	private async expandPath(
		connectionId: string,
		path: string,
	): Promise<string> {
		const trimmed = path.trim();
		if (trimmed === "~") {
			return this.getRemoteHomeDir(connectionId);
		}
		if (trimmed.startsWith("~/")) {
			const homeDir = await this.getRemoteHomeDir(connectionId);
			return `${homeDir}/${trimmed.slice(2)}`;
		}
		return trimmed;
	}

	async listRemoteDirectory(params: {
		connectionId: string;
		path: string;
	}): Promise<{ entries: Array<{ name: string; isDirectory: boolean }> }> {
		// Validate path doesn't contain control characters
		if (!isPathSafe(params.path)) {
			return { entries: [] };
		}

		try {
			// Expand ~ to actual home directory for SFTP
			const expandedPath = await this.expandPath(
				params.connectionId,
				params.path,
			);

			const sftp = await this.getSftp(params.connectionId);

			return new Promise((resolve) => {
				sftp.readdir(expandedPath, (err, list) => {
					// Always close the SFTP session when done
					sftp.end();

					if (err) {
						// Return empty list on error (e.g., permission denied, not a directory)
						resolve({ entries: [] });
						return;
					}

					const entries: Array<{ name: string; isDirectory: boolean }> = [];
					for (const item of list) {
						// Skip . and .. entries
						if (item.filename === "." || item.filename === "..") {
							continue;
						}
						entries.push({
							name: item.filename,
							// Check if it's a directory using the attrs.mode
							// S_IFDIR = 0o040000 (16384 in decimal)
							isDirectory: (item.attrs.mode & 0o170000) === 0o040000,
						});
					}

					resolve({ entries });
				});
			});
		} catch {
			// Return empty list on any error
			return { entries: [] };
		}
	}

	async getRemoteHomeDir(connectionId: string): Promise<string> {
		const result = await this.executeCommand({
			connectionId,
			command: "echo $HOME",
		});
		return result.stdout.trim() || "~";
	}

	async cleanup(): Promise<void> {
		// Close all shells
		for (const session of this.sessions.values()) {
			if (session.shell) {
				session.shell.close();
			}
		}
		this.sessions.clear();

		// Close all connections
		for (const client of this.connections.values()) {
			client.end();
		}
		this.connections.clear();

		this.removeAllListeners();
	}
}

export const sshManager = new SSHManager();
