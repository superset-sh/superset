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
	SshHostConnectionDiagnostic,
	SshHostConnectionDiagnosticPhase,
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
	pending: Promise<SshHostConnectionStatus> | null;
	remoteRootDir: string | null;
	remoteSessionName: string | null;
	sshTarget: string | null;
	status: SshHostConnectionStatus;
	tokenFingerprint: string | null;
}

interface SshCommandResult {
	command: string;
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

const REMOTE_PREREQUISITES_COMMAND = [
	"missing=''",
	...REMOTE_REQUIRED_TOOLS.map(
		(tool) =>
			`command -v ${tool} >/dev/null 2>&1 || missing="$missing${tool}\\n"`,
	),
	"printf '%b' \"$missing\"",
].join(" && ");

function shellEscape(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function formatArg(value: string): string {
	return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : shellEscape(value);
}

function formatCommand(command: string, args: string[]): string {
	return [command, ...args.map(formatArg)].join(" ");
}

function fingerprint(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function createDefaultStatus(hostId: string): SshHostConnectionStatus {
	return {
		diagnostic: null,
		health: null,
		hostId,
		hostUrl: null,
		lastError: null,
		localPort: null,
		missingPrerequisites: [],
		organizationId: null,
		remotePort: null,
		sshTarget: null,
		state: "idle",
		updatedAt: Date.now(),
	};
}

function createDiagnostic(params: {
	command?: string | null;
	detail?: string | null;
	exitCode?: number | null;
	phase: SshHostConnectionDiagnosticPhase;
	stderr?: string | null;
	summary: string;
}): SshHostConnectionDiagnostic {
	return {
		command: params.command ?? null,
		detail: params.detail ?? null,
		exitCode: params.exitCode ?? null,
		phase: params.phase,
		stderr: params.stderr ?? null,
		summary: params.summary,
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

class SshCommandError extends Error {
	public readonly command: string;
	public readonly exitCode: number | null;
	public readonly signal: NodeJS.Signals | null;
	public readonly stderr: string;
	public readonly stdout: string;

	constructor(params: {
		command: string;
		exitCode: number | null;
		signal: NodeJS.Signals | null;
		stderr: string;
		stdout: string;
	}) {
		super(
			[
				`SSH command failed: ${params.command}`,
				`exit: ${params.exitCode ?? "unknown"}${params.signal ? ` (${params.signal})` : ""}`,
				params.stderr.trim(),
			]
				.filter(Boolean)
				.join("\n"),
		);
		this.command = params.command;
		this.exitCode = params.exitCode;
		this.signal = params.signal;
		this.stderr = params.stderr;
		this.stdout = params.stdout;
	}
}

async function runProcess(options: {
	args: string[];
	command: string;
	input?: Buffer;
}): Promise<SshCommandResult> {
	const formattedCommand = formatCommand(options.command, options.args);
	const child = spawn(options.command, options.args, {
		stdio: ["pipe", "pipe", "pipe"],
	});

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
		throw new SshCommandError({
			command: formattedCommand,
			exitCode: code,
			signal,
			stderr,
			stdout,
		});
	}

	return {
		command: formattedCommand,
		stderr,
		stdout,
	};
}

async function runSshCommand(options: {
	command: string;
	input?: Buffer;
	target: string;
}): Promise<SshCommandResult> {
	return runProcess({
		args: [...SSH_COMMON_ARGS, options.target, options.command],
		command: "ssh",
		input: options.input,
	});
}

async function resolveSshTarget(target: string): Promise<SshCommandResult> {
	return runProcess({
		args: [...SSH_COMMON_ARGS, "-G", target],
		command: "ssh",
	});
}

function summarizeResolvedSshConfig(stdout: string): string | null {
	const interestingKeys = new Set([
		"hostname",
		"identityfile",
		"port",
		"proxyjump",
		"user",
	]);
	const seenKeys = new Set<string>();
	const lines = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.filter((line) => {
			const [key] = line.split(/\s+/, 1);
			if (!interestingKeys.has(key) || seenKeys.has(key)) {
				return false;
			}
			seenKeys.add(key);
			return true;
		});

	return lines.length > 0 ? lines.join("\n") : null;
}

function createErrorDiagnostic(
	phase: SshHostConnectionDiagnosticPhase,
	summary: string,
	error: unknown,
	fallback: {
		command?: string | null;
		detail?: string | null;
		stderr?: string | null;
	},
): SshHostConnectionDiagnostic {
	if (error instanceof SshCommandError) {
		return createDiagnostic({
			command: error.command,
			detail: error.stderr.trim() || fallback.detail || null,
			exitCode: error.exitCode,
			phase,
			stderr: error.stderr.trim() || null,
			summary,
		});
	}

	return createDiagnostic({
		command: fallback.command ?? null,
		detail:
			(error instanceof Error ? error.message : null) ??
			fallback.detail ??
			null,
		exitCode: null,
		phase,
		stderr: fallback.stderr ?? null,
		summary,
	});
}

function createMissingPrerequisiteDetail(
	missingPrerequisites: string[],
	resolvedConfigSummary: string | null,
): string {
	return [
		"Install the missing tools on the remote host and reconnect.",
		resolvedConfigSummary
			? `Resolved SSH config:\n${resolvedConfigSummary}`
			: null,
		`Missing: ${missingPrerequisites.join(", ")}`,
	]
		.filter(Boolean)
		.join("\n\n");
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

	private getConnection(hostId: string): ManagedConnection {
		const existing = this.connections.get(hostId);
		if (existing) {
			return existing;
		}

		const created: ManagedConnection = {
			bundleHash: null,
			forwardProcess: null,
			forwardStopRequested: false,
			hostId,
			localPort: null,
			pending: null,
			remoteRootDir: null,
			remoteSessionName: null,
			sshTarget: null,
			status: createDefaultStatus(hostId),
			tokenFingerprint: null,
		};
		this.connections.set(hostId, created);
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
			hostId: connection.hostId,
			organizationId: patch.organizationId ?? connection.status.organizationId,
			sshTarget: patch.sshTarget ?? connection.sshTarget,
			updatedAt: Date.now(),
		};
		return connection.status;
	}

	private async checkRemotePrerequisites(target: string): Promise<string[]> {
		const { stdout } = await runSshCommand({
			target,
			command: REMOTE_PREREQUISITES_COMMAND,
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
		const args = [
			...SSH_COMMON_ARGS,
			"-o",
			"ExitOnForwardFailure=yes",
			"-N",
			"-L",
			`${localPort}:127.0.0.1:${remotePort}`,
			target,
		];
		const command = formatCommand("ssh", args);
		const child = spawn("ssh", args, {
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000);
		});
		child.on("exit", (code) => {
			if (connection.forwardProcess !== child) {
				return;
			}
			connection.forwardProcess = null;
			connection.localPort = null;
			if (connection.forwardStopRequested) {
				if (connection.status.state !== "error") {
					this.updateStatus(connection, {
						diagnostic: createDiagnostic({
							command,
							phase: "disconnect",
							summary: "SSH tunnel disconnected",
						}),
						health: null,
						hostUrl: null,
						lastError: null,
						localPort: null,
						state: "idle",
					});
				}
				return;
			}
			const summary =
				stderr.trim() || "SSH port forwarding exited unexpectedly";
			this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					command,
					detail: "Reconnect the SSH host to establish a new forwarded tunnel.",
					exitCode: code,
					phase: "connect",
					stderr: stderr.trim() || null,
					summary,
				}),
				health: null,
				hostUrl: null,
				lastError: summary,
				localPort: null,
				state: "error",
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
			getSshHostServiceSessionName(options.connection.hostId);
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

	private async resolveAndValidateTarget(connection: ManagedConnection) {
		if (!connection.sshTarget) {
			throw new Error(`SSH host ${connection.hostId} is not configured`);
		}

		const resolvedConfig = await resolveSshTarget(connection.sshTarget);
		const resolvedConfigSummary = summarizeResolvedSshConfig(
			resolvedConfig.stdout,
		);
		const missingPrerequisites = await this.checkRemotePrerequisites(
			connection.sshTarget,
		);

		return {
			missingPrerequisites,
			resolvedConfig,
			resolvedConfigSummary,
		};
	}

	private async checkCurrentHealth(
		connection: ManagedConnection,
		phase: "connect" | "healthcheck",
	): Promise<SshHostConnectionStatus> {
		if (
			!isForwardProcessAlive(connection.forwardProcess) ||
			connection.localPort === null
		) {
			const summary = "SSH tunnel is not connected";
			return this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					detail: "Run connect to establish the forwarded local port.",
					phase,
					summary,
				}),
				health: null,
				hostUrl: null,
				lastError: connection.status.state === "idle" ? null : summary,
				localPort: null,
				state: connection.status.state === "idle" ? "idle" : "error",
			});
		}

		const hostUrl = toHostUrl(connection.localPort);
		try {
			const health = await waitForHealthCheck(hostUrl);
			return this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					command: `GET ${hostUrl}/healthz`,
					phase,
					summary:
						phase === "connect"
							? "SSH tunnel is ready"
							: "SSH tunnel healthcheck succeeded",
				}),
				health,
				hostUrl,
				lastError: null,
				localPort: connection.localPort,
				missingPrerequisites: [],
				state: "ready",
			});
		} catch (error) {
			await this.stopForwardProcess(connection).catch(() => {});
			const summary =
				error instanceof Error
					? error.message
					: "SSH tunnel healthcheck failed";
			return this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					command: `GET ${hostUrl}/healthz`,
					detail: "Reconnect the SSH host to establish a healthy tunnel.",
					phase,
					summary,
				}),
				health: null,
				hostUrl: null,
				lastError: summary,
				localPort: null,
				state: "error",
			});
		}
	}

	getStatus(hostId: string): SshHostConnectionStatus {
		return this.getConnection(hostId).status;
	}

	getStatuses(): SshHostConnectionStatus[] {
		return [...this.connections.values()].map(
			(connection) => connection.status,
		);
	}

	async probe(hostId: string): Promise<SshHostConnectionStatus> {
		const connection = this.getConnection(hostId);
		if (connection.pending) {
			return connection.pending;
		}

		const host = getSshHost(hostId);
		if (!host) {
			const summary = `SSH host ${hostId} is not configured`;
			return this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					detail: "Add or restore the SSH host configuration before probing.",
					phase: "probe",
					summary,
				}),
				health: null,
				hostUrl: null,
				lastError: summary,
				localPort: null,
				missingPrerequisites: [],
				remotePort: null,
				sshTarget: null,
				state: "error",
			});
		}

		connection.sshTarget = host.sshTarget.trim();
		connection.remoteRootDir = resolveSshHostRemoteRootDir(
			host.id,
			host.remoteRootDir ?? getDefaultSshHostRemoteRootDir(host.id),
		);
		connection.remoteSessionName = getSshHostServiceSessionName(host.id);

		this.updateStatus(connection, {
			diagnostic: null,
			health:
				connection.status.state === "ready" ? connection.status.health : null,
			hostUrl:
				connection.status.state === "ready" ? connection.status.hostUrl : null,
			lastError: null,
			localPort:
				connection.status.state === "ready"
					? connection.status.localPort
					: null,
			missingPrerequisites: [],
			remotePort: getSshHostRemotePort(host.id),
			sshTarget: connection.sshTarget,
			state: isForwardProcessAlive(connection.forwardProcess)
				? connection.status.state
				: "checking",
		});

		try {
			const { missingPrerequisites, resolvedConfig, resolvedConfigSummary } =
				await this.resolveAndValidateTarget(connection);

			if (missingPrerequisites.length > 0) {
				const summary = `Remote host is missing required tools: ${missingPrerequisites.join(", ")}`;
				return this.updateStatus(connection, {
					diagnostic: createDiagnostic({
						command: resolvedConfig.command,
						detail: createMissingPrerequisiteDetail(
							missingPrerequisites,
							resolvedConfigSummary,
						),
						phase: "probe",
						summary,
					}),
					health: null,
					hostUrl: null,
					lastError: summary,
					localPort: null,
					missingPrerequisites,
					state: "error",
				});
			}

			return this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					command: resolvedConfig.command,
					detail: resolvedConfigSummary,
					phase: "probe",
					summary: "SSH probe succeeded",
				}),
				lastError: null,
				missingPrerequisites: [],
				state: isForwardProcessAlive(connection.forwardProcess)
					? connection.status.state
					: "idle",
			});
		} catch (error) {
			const summary =
				error instanceof Error ? error.message : "SSH probe failed";
			return this.updateStatus(connection, {
				diagnostic: createErrorDiagnostic("probe", summary, error, {
					command: connection.sshTarget
						? formatCommand("ssh", [
								...SSH_COMMON_ARGS,
								"-G",
								connection.sshTarget,
							])
						: null,
					detail:
						"Verify the host alias, SSH config, and credentials used by the system ssh binary.",
				}),
				health: null,
				hostUrl: null,
				lastError: summary,
				localPort: null,
				missingPrerequisites: [],
				state: "error",
			});
		}
	}

	async connect(hostId: string): Promise<SshHostConnectionStatus> {
		const connection = this.getConnection(hostId);
		if (connection.pending) {
			return connection.pending;
		}

		const promise = this.connectInternal(connection).finally(() => {
			if (connection.pending === promise) {
				connection.pending = null;
			}
		});
		connection.pending = promise;
		return promise;
	}

	async ensureConnected(hostId: string): Promise<SshHostConnectionStatus> {
		return this.connect(hostId);
	}

	private async connectInternal(
		connection: ManagedConnection,
	): Promise<SshHostConnectionStatus> {
		const host = getSshHost(connection.hostId);
		if (!host) {
			const summary = `SSH host ${connection.hostId} is not configured`;
			const status = this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					detail:
						"Add or restore the SSH host configuration before connecting.",
					phase: "connect",
					summary,
				}),
				lastError: summary,
				sshTarget: null,
				state: "error",
			});
			throw new Error(status.lastError ?? summary);
		}

		const target = host.sshTarget.trim();
		const remoteRootDir = resolveSshHostRemoteRootDir(
			host.id,
			host.remoteRootDir ?? getDefaultSshHostRemoteRootDir(host.id),
		);
		const remotePort = getSshHostRemotePort(host.id);
		const tokenRecord = await loadToken();
		const token = tokenRecord?.token?.trim();
		if (!token) {
			const summary =
				"Desktop auth token missing; sign in again to use SSH hosts";
			const status = this.updateStatus(connection, {
				diagnostic: createDiagnostic({
					detail:
						"Restore desktop authentication so the remote host-service can authenticate back to Superset.",
					phase: "connect",
					summary,
				}),
				state: "error",
				lastError: summary,
				sshTarget: target,
			});
			throw new Error(status.lastError ?? summary);
		}

		connection.sshTarget = target;
		connection.remoteRootDir = remoteRootDir;
		connection.remoteSessionName = getSshHostServiceSessionName(host.id);

		const tokenFingerprint = fingerprint(token);
		const currentReadyStatus =
			connection.status.state === "ready" &&
			connection.tokenFingerprint === tokenFingerprint &&
			connection.bundleHash !== null &&
			connection.sshTarget === target &&
			isForwardProcessAlive(connection.forwardProcess) &&
			connection.localPort !== null;
		if (currentReadyStatus) {
			return this.checkCurrentHealth(connection, "connect");
		}

		this.updateStatus(connection, {
			diagnostic: null,
			health: null,
			hostUrl: null,
			lastError: null,
			localPort: null,
			missingPrerequisites: [],
			remotePort,
			sshTarget: target,
			state: "checking",
		});

		try {
			const { missingPrerequisites, resolvedConfig, resolvedConfigSummary } =
				await this.resolveAndValidateTarget(connection);
			if (missingPrerequisites.length > 0) {
				const summary = `Remote host is missing required tools: ${missingPrerequisites.join(", ")}`;
				const status = this.updateStatus(connection, {
					diagnostic: createDiagnostic({
						command: resolvedConfig.command,
						detail: createMissingPrerequisiteDetail(
							missingPrerequisites,
							resolvedConfigSummary,
						),
						phase: "connect",
						summary,
					}),
					lastError: summary,
					missingPrerequisites,
					state: "error",
				});
				throw new Error(status.lastError ?? summary);
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
			const dbPath = path.posix.join(remoteRootDir, "host.db");
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
				diagnostic: createDiagnostic({
					command: resolvedConfig.command,
					detail: resolvedConfigSummary,
					phase: "connect",
					summary: "SSH tunnel is ready",
				}),
				health,
				hostUrl: toHostUrl(localPort),
				lastError: null,
				localPort,
				missingPrerequisites: [],
				remotePort,
				state: "ready",
			});
		} catch (error) {
			const summary =
				error instanceof Error
					? error.message
					: "Failed to connect to SSH host";
			this.updateStatus(connection, {
				diagnostic: createErrorDiagnostic("connect", summary, error, {
					command:
						connection.sshTarget === null
							? null
							: formatCommand("ssh", [
									...SSH_COMMON_ARGS,
									"-G",
									connection.sshTarget,
								]),
					detail:
						"Inspect the SSH target, remote prerequisites, and remote host-service logs before reconnecting.",
				}),
				state: "error",
				hostUrl: null,
				localPort: null,
				lastError: summary,
				health: null,
			});
			await this.stopForwardProcess(connection).catch(() => {});
			throw error instanceof Error ? error : new Error(summary);
		}
	}

	async healthcheck(hostId: string): Promise<SshHostConnectionStatus> {
		const connection = this.getConnection(hostId);
		if (connection.pending) {
			return connection.pending;
		}

		return this.checkCurrentHealth(connection, "healthcheck");
	}

	async disconnect(
		hostId: string,
		options?: { shutdownRemote?: boolean },
	): Promise<void> {
		const connection = this.getConnection(hostId);
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
			diagnostic: createDiagnostic({
				detail:
					options?.shutdownRemote === true
						? "Stopped the forwarded tunnel and requested remote tmux shutdown."
						: "Stopped the forwarded local port for this SSH host.",
				phase: "disconnect",
				summary: "SSH tunnel disconnected",
			}),
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
			await this.disconnect(connection.hostId, options);
		}
	}

	async disconnectHost(
		hostId: string,
		options?: { shutdownRemote?: boolean },
	): Promise<void> {
		if (!this.connections.has(hostId)) {
			return;
		}
		await this.disconnect(hostId, options);
	}
}

let manager: SshHostServiceManager | null = null;

export function getSshHostServiceManager(): SshHostServiceManager {
	if (!manager) {
		manager = new SshHostServiceManager();
	}
	return manager;
}
