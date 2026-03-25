import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { loadToken } from "lib/trpc/routers/auth/utils/auth-functions";
import { env } from "main/env.main";
import {
	getDefaultSshHostRemoteRootDir,
	getSshHostDeviceClientId,
	getSshHostRemotePort,
	getSshHostServiceSessionName,
	resolveSshHostRemoteRootDir,
} from "../../../shared/ssh-hosts";
import { getSshHostBundle } from "./bundle";
import { getSshHost } from "./settings";
import type {
	SshHostConnectionState,
	SshHostConnectionStatus,
	SshHostHealthSnapshot,
} from "./types";

interface ManagedConnection {
	bundleHash: string | null;
	forwardProcess: ChildProcess | null;
	forwardStopRequested: boolean;
	hostId: string;
	localPort: number | null;
	organizationId: string;
	pending: Promise<SshHostConnectionStatus> | null;
	remoteRootDir: string | null;
	remoteSessionName: string | null;
	status: SshHostConnectionStatus;
	sshTarget: string | null;
	tokenFingerprint: string | null;
}

interface SshCommandResult {
	stderr: string;
	stdout: string;
}

const SSH_COMMON_ARGS = [
	"-o",
	"BatchMode=yes",
	"-o",
	"ConnectTimeout=10",
	"-o",
	"ServerAliveInterval=20",
	"-o",
	"ServerAliveCountMax=3",
];

const REMOTE_REQUIRED_TOOLS = ["node", "bun", "git", "rg", "tmux"] as const;

function shellEscape(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function createConnectionKey(organizationId: string, hostId: string): string {
	return `${organizationId}:${hostId}`;
}

function fingerprint(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function createDefaultStatus(
	organizationId: string,
	hostId: string,
): SshHostConnectionStatus {
	return {
		hostId,
		organizationId,
		state: "idle",
		hostUrl: null,
		localPort: null,
		remotePort: null,
		lastError: null,
		missingPrerequisites: [],
		health: null,
		updatedAt: Date.now(),
	};
}

function isForwardProcessAlive(process: ChildProcess | null): boolean {
	return process !== null && process.exitCode === null && !process.killed;
}

function waitForExit(
	process: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	return new Promise((resolve) => {
		process.once("exit", (code, signal) => {
			resolve({ code, signal });
		});
	});
}

function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() =>
					reject(new Error("Failed to allocate a local port")),
				);
				return;
			}
			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

function toHostUrl(localPort: number): string {
	return `http://127.0.0.1:${localPort}`;
}

async function waitForHealthCheck(
	hostUrl: string,
): Promise<SshHostHealthSnapshot> {
	const attempts = 12;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 1_500);
			const response = await fetch(`${hostUrl}/healthz`, {
				signal: controller.signal,
			});
			clearTimeout(timeout);
			if (response.ok) {
				return (await response.json()) as SshHostHealthSnapshot;
			}
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error("Timed out waiting for the remote host-service health check");
}

function buildRemoteLauncherScript(input: {
	bundleDir: string;
	dbPath: string;
	deviceClientId: string;
	deviceName: string;
	hostPort: number;
	logPath: string;
	token: string;
}) {
	const hostServiceScriptPath = path.posix.join(
		input.bundleDir,
		"main/host-service.js",
	);
	const migrationsPath = path.posix.join(input.bundleDir, "host-migrations");
	const envEntries = {
		AUTH_TOKEN: input.token,
		CLOUD_API_URL: env.NEXT_PUBLIC_API_URL,
		DEVICE_CLIENT_ID: input.deviceClientId,
		DEVICE_NAME: input.deviceName,
		HOST_DB_PATH: input.dbPath,
		HOST_MIGRATIONS_PATH: migrationsPath,
		HOST_PORT: String(input.hostPort),
		HOST_TERMINAL_MODE: "tmux",
	};
	const envAssignments = Object.entries(envEntries)
		.map(([key, value]) => `${key}=${shellEscape(value)}`)
		.join(" ");

	return [
		"#!/bin/sh",
		"set -eu",
		`cd ${shellEscape(input.bundleDir)}`,
		`exec ${envAssignments} node ${shellEscape(hostServiceScriptPath)} >> ${shellEscape(input.logPath)} 2>&1`,
		"",
	].join("\n");
}

async function runSshCommand(options: {
	command: string;
	input?: Buffer;
	target: string;
}): Promise<SshCommandResult> {
	const child = spawn(
		"ssh",
		[...SSH_COMMON_ARGS, options.target, options.command],
		{
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
	child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

	if (options.input) {
		child.stdin.write(options.input);
	}
	child.stdin.end();

	const { code, signal } = await waitForExit(child);
	const stdout = Buffer.concat(stdoutChunks).toString("utf8");
	const stderr = Buffer.concat(stderrChunks).toString("utf8");
	if (code !== 0) {
		throw new Error(
			[
				`SSH command failed for ${options.target}`,
				`command: ${options.command}`,
				`exit: ${code}${signal ? ` (${signal})` : ""}`,
				stderr.trim(),
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	return { stdout, stderr };
}

async function uploadRemoteFile(options: {
	contents: Buffer;
	remotePath: string;
	target: string;
}): Promise<void> {
	const remoteDir = path.posix.dirname(options.remotePath);
	await runSshCommand({
		target: options.target,
		command: `mkdir -p ${shellEscape(remoteDir)} && cat > ${shellEscape(options.remotePath)}`,
		input: options.contents,
	});
}

export class SshHostServiceManager {
	private readonly connections = new Map<string, ManagedConnection>();

	private getConnection(
		organizationId: string,
		hostId: string,
	): ManagedConnection {
		const key = createConnectionKey(organizationId, hostId);
		const existing = this.connections.get(key);
		if (existing) {
			return existing;
		}

		const created: ManagedConnection = {
			bundleHash: null,
			forwardProcess: null,
			forwardStopRequested: false,
			hostId,
			localPort: null,
			organizationId,
			pending: null,
			remoteRootDir: null,
			remoteSessionName: null,
			status: createDefaultStatus(organizationId, hostId),
			sshTarget: null,
			tokenFingerprint: null,
		};
		this.connections.set(key, created);
		return created;
	}

	private updateStatus(
		connection: ManagedConnection,
		patch: Partial<SshHostConnectionStatus> & {
			state?: SshHostConnectionState;
		},
	): SshHostConnectionStatus {
		connection.status = {
			...connection.status,
			...patch,
			updatedAt: Date.now(),
		};
		return connection.status;
	}

	private async checkRemotePrerequisites(target: string): Promise<string[]> {
		const { stdout } = await runSshCommand({
			target,
			command: [
				"missing=''",
				...REMOTE_REQUIRED_TOOLS.map(
					(tool) =>
						`command -v ${tool} >/dev/null 2>&1 || missing="$missing${tool}\\n"`,
				),
				"printf '%b' \"$missing\"",
			].join(" && "),
		});

		return stdout
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	private async ensureRemoteBundle(target: string, remoteRootDir: string) {
		const bundle = getSshHostBundle();
		const bundleDir = path.posix.join(
			remoteRootDir,
			"bundles",
			bundle.bundleHash,
		);
		const remotePackagePath = path.posix.join(bundleDir, "package.json");

		let shouldUpload = true;
		try {
			await runSshCommand({
				target,
				command: `test -f ${shellEscape(remotePackagePath)}`,
			});
			shouldUpload = false;
		} catch {
			shouldUpload = true;
		}

		if (shouldUpload) {
			for (const file of bundle.files) {
				await uploadRemoteFile({
					target,
					remotePath: path.posix.join(bundleDir, file.relativePath),
					contents: file.contents,
				});
			}
		}

		return {
			bundleDir,
			bundleHash: bundle.bundleHash,
			shouldUpload,
		};
	}

	private async ensureRemoteDependencies(target: string, bundleDir: string) {
		await runSshCommand({
			target,
			command: [
				`mkdir -p ${shellEscape(bundleDir)}`,
				`cd ${shellEscape(bundleDir)}`,
				"if [ ! -d node_modules ]; then bun install --production; fi",
			].join(" && "),
		});
	}

	private startForwardProcess(
		connection: ManagedConnection,
		target: string,
		localPort: number,
		remotePort: number,
	) {
		connection.forwardStopRequested = false;
		const child = spawn(
			"ssh",
			[
				...SSH_COMMON_ARGS,
				"-o",
				"ExitOnForwardFailure=yes",
				"-N",
				"-L",
				`${localPort}:127.0.0.1:${remotePort}`,
				target,
			],
			{
				stdio: ["ignore", "ignore", "pipe"],
			},
		);
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4000);
		});
		child.on("exit", () => {
			if (connection.forwardProcess !== child) {
				return;
			}
			connection.forwardProcess = null;
			connection.localPort = null;
			if (connection.forwardStopRequested) {
				this.updateStatus(connection, {
					hostUrl: null,
					localPort: null,
					state: "idle",
				});
				return;
			}
			this.updateStatus(connection, {
				hostUrl: null,
				localPort: null,
				state: "error",
				lastError: stderr.trim() || "SSH port forwarding exited unexpectedly",
			});
		});
		connection.forwardProcess = child;
		connection.localPort = localPort;
	}

	private async restartRemoteHostService(options: {
		bundleDir: string;
		connection: ManagedConnection;
		dbPath: string;
		hostPort: number;
		target: string;
		token: string;
	}) {
		const host = getSshHost(options.connection.hostId);
		if (!host) {
			throw new Error(`SSH host ${options.connection.hostId} not found`);
		}

		const launcherPath = path.posix.join(
			options.bundleDir,
			"launch-host-service.sh",
		);
		const logPath = path.posix.join(options.bundleDir, "host-service.log");
		const sessionName =
			options.connection.remoteSessionName ??
			getSshHostServiceSessionName(
				options.connection.organizationId,
				options.connection.hostId,
			);
		const launcherScript = buildRemoteLauncherScript({
			bundleDir: options.bundleDir,
			dbPath: options.dbPath,
			deviceClientId: getSshHostDeviceClientId(options.connection.hostId),
			deviceName: host.name,
			hostPort: options.hostPort,
			logPath,
			token: options.token,
		});

		await uploadRemoteFile({
			target: options.target,
			remotePath: launcherPath,
			contents: Buffer.from(launcherScript, "utf8"),
		});

		await runSshCommand({
			target: options.target,
			command: [
				`chmod 700 ${shellEscape(launcherPath)}`,
				`tmux has-session -t ${shellEscape(sessionName)} 2>/dev/null && tmux kill-session -t ${shellEscape(sessionName)} || true`,
				`tmux new-session -d -s ${shellEscape(sessionName)} ${shellEscape(`sh ${launcherPath}`)}`,
			].join(" && "),
		});

		options.connection.remoteSessionName = sessionName;
	}

	private async stopForwardProcess(connection: ManagedConnection) {
		const process = connection.forwardProcess;
		if (!process) {
			connection.localPort = null;
			return;
		}
		connection.forwardStopRequested = true;
		process.kill("SIGTERM");
		await waitForExit(process);
		connection.forwardProcess = null;
		connection.localPort = null;
	}

	getStatus(organizationId: string, hostId: string): SshHostConnectionStatus {
		return this.getConnection(organizationId, hostId).status;
	}

	getStatuses(organizationId: string): SshHostConnectionStatus[] {
		return [...this.connections.values()]
			.filter((connection) => connection.organizationId === organizationId)
			.map((connection) => connection.status);
	}

	async ensureConnected(
		organizationId: string,
		hostId: string,
	): Promise<SshHostConnectionStatus> {
		const connection = this.getConnection(organizationId, hostId);
		if (connection.pending) {
			return connection.pending;
		}

		const promise = this.connectInternal(connection).finally(() => {
			connection.pending = null;
		});
		connection.pending = promise;
		return promise;
	}

	private async connectInternal(
		connection: ManagedConnection,
	): Promise<SshHostConnectionStatus> {
		const host = getSshHost(connection.hostId);
		if (!host) {
			throw new Error(`SSH host ${connection.hostId} is not configured`);
		}

		const target = host.sshTarget.trim();
		const remoteRootDir = resolveSshHostRemoteRootDir(
			host.id,
			host.remoteRootDir ?? getDefaultSshHostRemoteRootDir(host.id),
		);
		const remotePort = getSshHostRemotePort(connection.organizationId, host.id);
		const tokenRecord = await loadToken();
		const token = tokenRecord?.token?.trim();
		if (!token) {
			const status = this.updateStatus(connection, {
				state: "error",
				lastError: "Desktop auth token missing; sign in again to use SSH hosts",
			});
			throw new Error(status.lastError ?? "Missing desktop auth token");
		}

		connection.sshTarget = target;
		connection.remoteRootDir = remoteRootDir;
		connection.remoteSessionName = getSshHostServiceSessionName(
			connection.organizationId,
			host.id,
		);

		const tokenFingerprint = fingerprint(token);
		const currentReadyStatus =
			connection.status.state === "ready" &&
			connection.hostId === host.id &&
			connection.tokenFingerprint === tokenFingerprint &&
			connection.bundleHash !== null &&
			connection.sshTarget === target &&
			isForwardProcessAlive(connection.forwardProcess) &&
			connection.localPort !== null;
		if (currentReadyStatus) {
			try {
				const health = await waitForHealthCheck(
					toHostUrl(connection.localPort),
				);
				return this.updateStatus(connection, {
					health,
					hostUrl: toHostUrl(connection.localPort),
					lastError: null,
					localPort: connection.localPort,
					missingPrerequisites: [],
					remotePort,
					state: "ready",
				});
			} catch {
				await this.stopForwardProcess(connection);
			}
		}

		this.updateStatus(connection, {
			state: "checking",
			lastError: null,
			missingPrerequisites: [],
			health: null,
			hostUrl: null,
			localPort: null,
			remotePort,
		});

		try {
			const missingPrerequisites = await this.checkRemotePrerequisites(target);
			if (missingPrerequisites.length > 0) {
				const message = `Remote host is missing required tools: ${missingPrerequisites.join(", ")}`;
				const status = this.updateStatus(connection, {
					state: "error",
					lastError: message,
					missingPrerequisites,
				});
				throw new Error(status.lastError ?? message);
			}

			this.updateStatus(connection, { state: "syncing" });
			const { bundleDir, bundleHash } = await this.ensureRemoteBundle(
				target,
				remoteRootDir,
			);
			connection.bundleHash = bundleHash;

			this.updateStatus(connection, { state: "installing" });
			await this.ensureRemoteDependencies(target, bundleDir);

			this.updateStatus(connection, { state: "starting" });
			const dbPath = path.posix.join(
				remoteRootDir,
				"orgs",
				connection.organizationId,
				"host.db",
			);
			await this.restartRemoteHostService({
				bundleDir,
				connection,
				dbPath,
				hostPort: remotePort,
				target,
				token,
			});

			this.updateStatus(connection, { state: "forwarding" });
			const localPort = await getFreePort();
			this.startForwardProcess(connection, target, localPort, remotePort);

			const health = await waitForHealthCheck(toHostUrl(localPort));
			connection.tokenFingerprint = tokenFingerprint;
			return this.updateStatus(connection, {
				health,
				hostUrl: toHostUrl(localPort),
				lastError: null,
				localPort,
				missingPrerequisites: [],
				remotePort,
				state: "ready",
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to connect to SSH host";
			this.updateStatus(connection, {
				state: "error",
				hostUrl: null,
				localPort: null,
				lastError: message,
				health: null,
			});
			await this.stopForwardProcess(connection).catch(() => {});
			throw error instanceof Error ? error : new Error(message);
		}
	}

	async disconnect(
		organizationId: string,
		hostId: string,
		options?: { shutdownRemote?: boolean },
	): Promise<void> {
		const connection = this.getConnection(organizationId, hostId);
		await this.stopForwardProcess(connection);

		if (
			options?.shutdownRemote &&
			connection.sshTarget &&
			connection.remoteSessionName
		) {
			await runSshCommand({
				target: connection.sshTarget,
				command: `tmux has-session -t ${shellEscape(connection.remoteSessionName)} 2>/dev/null && tmux kill-session -t ${shellEscape(connection.remoteSessionName)} || true`,
			}).catch(() => {});
		}

		connection.tokenFingerprint = null;
		connection.bundleHash = null;
		this.updateStatus(connection, {
			state: "idle",
			hostUrl: null,
			localPort: null,
			lastError: null,
			missingPrerequisites: [],
			health: null,
			remotePort: null,
		});
	}

	async disconnectAll(options?: { shutdownRemote?: boolean }): Promise<void> {
		for (const connection of this.connections.values()) {
			await this.disconnect(
				connection.organizationId,
				connection.hostId,
				options,
			);
		}
	}

	async disconnectHost(
		hostId: string,
		options?: { shutdownRemote?: boolean },
	): Promise<void> {
		for (const connection of this.connections.values()) {
			if (connection.hostId !== hostId) {
				continue;
			}
			await this.disconnect(
				connection.organizationId,
				connection.hostId,
				options,
			);
		}
	}
}

let manager: SshHostServiceManager | null = null;

export function getSshHostServiceManager(): SshHostServiceManager {
	if (!manager) {
		manager = new SshHostServiceManager();
	}
	return manager;
}
