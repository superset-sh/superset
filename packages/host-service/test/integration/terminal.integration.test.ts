import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@superset/pty-daemon";
import { TRPCClientError } from "@trpc/client";
import { DaemonClient } from "../../src/terminal/DaemonClient";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { listTerminalResourceSessions } from "../../src/terminal/resource-sessions";
import {
	__resetSessionsForTesting,
	disposeSessionsByWorkspaceId,
} from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell.ts";
import { makeTestDaemonSocketPath } from "../helpers/platform";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";
import { seedTerminalSession } from "../helpers/seed";

describe("terminal router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		initTerminalBaseEnv({
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			HOME: process.env.HOME ?? tmpdir(),
			SHELL: "/bin/sh",
		});
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		__resetSessionsForTesting();
		await disposeDaemonClient();
		resetTerminalBaseEnvForTests();
		__setAccountShellForTesting(undefined);
		delete process.env.SUPERSET_PTY_DAEMON_SOCKET;
		delete process.env.SUPERSET_HOME_DIR;
		await scenario?.dispose();
	});

	test("listSessions returns empty when no sessions exist", async () => {
		const result = await scenario.host.trpc.terminal.listSessions.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.sessions).toEqual([]);
	});

	test("killSession throws NOT_FOUND for unknown workspace", async () => {
		await expect(
			scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: "no-such-ws",
				terminalId: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("killSession throws NOT_FOUND for unknown terminal", async () => {
		await expect(
			scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("listSessions requires authentication", async () => {
		await expect(
			scenario.host.unauthenticatedTrpc.terminal.listSessions.query({
				workspaceId: scenario.workspaceId,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("createSession sends the configured shell to the daemon instead of inherited bash", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "host-service-terminal-shell-"));
		const socketPath = makeTestDaemonSocketPath("host-service-terminal-shell");
		const fakeFishPath = join(tmp, "fish");
		const terminalId = randomUUID();
		const spawned: Array<{
			meta: {
				shell: string;
				argv: string[];
				env?: Record<string, string>;
			};
		}> = [];
		const server = new Server({
			socketPath,
			daemonVersion: "0.0.0-terminal-shell-test",
			spawnPty: ({ meta }) => {
				spawned.push({ meta });
				return createFakePty(4200 + spawned.length, meta);
			},
		});

		writeFileSync(fakeFishPath, "#!/bin/sh\n", { mode: 0o755 });

		try {
			await server.listen();
			process.env.SUPERSET_PTY_DAEMON_SOCKET = socketPath;
			process.env.SUPERSET_HOME_DIR = tmp;
			__setAccountShellForTesting(fakeFishPath);
			resetTerminalBaseEnvForTests();
			initTerminalBaseEnv({
				PATH: `${tmp}:${process.env.PATH ?? "/usr/bin:/bin"}`,
				HOME: process.env.HOME ?? tmp,
				SHELL: "/bin/bash",
			});

			await scenario.host.trpc.terminal.createSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId,
			});
			const detachedCount =
				await scenario.host.trpc.terminal.countBackgroundSessions.query({
					workspaceId: scenario.workspaceId,
					attachedTerminalIds: [],
				});
			const attachedCount =
				await scenario.host.trpc.terminal.countBackgroundSessions.query({
					workspaceId: scenario.workspaceId,
					attachedTerminalIds: [terminalId],
				});

			expect(spawned).toHaveLength(1);
			expect(detachedCount.count).toBe(1);
			expect(attachedCount.count).toBe(0);
			const [{ meta }] = spawned;
			if (process.platform === "win32") {
				const expectedShell = "cmd.exe";
				expect(meta.shell).toBe(expectedShell);
				expect(meta.argv).toEqual([]);
				expect(meta.env?.SHELL).toBe(expectedShell);
			} else {
				expect(meta.shell).toBe(fakeFishPath);
				expect(meta.argv[0]).toBe("-l");
				expect(meta.argv[1]).toBe("--init-command");
				expect(meta.env?.SHELL).toBe(fakeFishPath);
			}
			expect(meta.env?.SUPERSET_TERMINAL_ID).toBe(terminalId);
		} finally {
			await scenario.host.trpc.terminal.killSession
				.mutate({
					workspaceId: scenario.workspaceId,
					terminalId,
				})
				.catch(() => {});
			await disposeDaemonClient();
			await server.close();
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test(
		"terminal disposal cleans up background process groups from real daemon sessions",
		{ timeout: 20_000 },
		async () => {
			const tmp = mkdtempSync(join(tmpdir(), "host-service-terminal-pgrp-"));
			const socketPath = makeTestDaemonSocketPath("host-service-terminal-pgrp");
			const pidPath = join(tmp, "detached-helper.pid");
			const workspaceCleanupPidPath = join(
				tmp,
				"workspace-detached-helper.pid",
			);
			const terminalId = randomUUID();
			const workspaceCleanupTerminalId = randomUUID();
			let daemonProcess: ChildProcess | null = null;
			let daemonStdout = "";
			let daemonStderr = "";
			let daemonSpawnError = "";
			let diagnosticDaemon: DaemonClient | null = null;
			let diagnosticUnsubscribe: (() => void) | null = null;
			let terminalOutput = "";
			let terminalExit = "";
			let daemonSessionSnapshot = "";
			let helperPid: number | null = null;
			let workspaceCleanupHelperPid: number | null = null;

			try {
				const daemonBundlePath = fileURLToPath(
					new URL("../../../pty-daemon/dist/pty-daemon.js", import.meta.url),
				);
				ensureDaemonBundle(daemonBundlePath);
				const daemonArgs = [daemonBundlePath, `--socket=${socketPath}`];
				daemonProcess = spawn("node", daemonArgs, {
					stdio: ["ignore", "pipe", "pipe"],
					env: {
						...process.env,
						SUPERSET_PTY_DAEMON_VERSION: "0.0.0-host-service-terminal-test",
					},
				});
				daemonProcess.stdout?.on("data", (chunk) => {
					daemonStdout += chunk.toString();
				});
				daemonProcess.stderr?.on("data", (chunk) => {
					daemonStderr += chunk.toString();
				});
				daemonProcess.once("error", (error) => {
					daemonSpawnError =
						error instanceof Error
							? (error.stack ?? error.message)
							: String(error);
				});
				await waitFor(
					() =>
						isWindowsNamedPipe(socketPath)
							? canConnect(socketPath)
							: existsSync(socketPath),
					3000,
					() =>
						[
							"pty-daemon did not create socket",
							`args: node ${daemonArgs.join(" ")}`,
							`exitCode: ${daemonProcess?.exitCode ?? "null"}`,
							`signalCode: ${daemonProcess?.signalCode ?? "null"}`,
							`spawnError:\n${daemonSpawnError}`,
							`stdout:\n${daemonStdout}`,
							`stderr:\n${daemonStderr}`,
						].join("\n"),
				);
				process.env.SUPERSET_PTY_DAEMON_SOCKET = socketPath;
				process.env.SUPERSET_HOME_DIR = tmp;
				const shell = platformTestShell();
				__setAccountShellForTesting(shell);
				resetTerminalBaseEnvForTests();
				initTerminalBaseEnv({
					...testPathEnv(),
					...(process.platform === "win32" ? { COMSPEC: shell } : {}),
					HOME: process.env.HOME ?? tmp,
					SHELL: shell,
				});

				const initialCommand = detachedHelperShellCommand(pidPath);
				await scenario.host.trpc.terminal.launchSession.mutate({
					workspaceId: scenario.workspaceId,
					terminalId,
					initialCommand,
				});
				diagnosticDaemon = new DaemonClient({ socketPath });
				await diagnosticDaemon.connect();
				diagnosticUnsubscribe = diagnosticDaemon.subscribe(
					terminalId,
					{ replay: true },
					{
						onOutput(chunk) {
							terminalOutput += chunk.toString("utf8");
							terminalOutput = tail(terminalOutput, 4000);
						},
						onExit(info) {
							terminalExit = JSON.stringify(info);
						},
					},
				);

				if (process.platform === "win32") {
					await waitFor(
						async () => {
							daemonSessionSnapshot =
								await describeDaemonSessions(diagnosticDaemon);
							helperPid = await findDaemonSessionPid(
								diagnosticDaemon,
								terminalId,
							);
							return helperPid !== null && isPidAlive(helperPid);
						},
						10_000,
						() =>
							terminalStartupFailureMessage({
								reason: "daemon session pid was not alive",
								pidPath,
								shell,
								initialCommand,
								daemonSessionSnapshot,
								terminalExit,
								terminalOutput,
								daemonStdout,
								daemonStderr,
							}),
					);
				} else {
					await waitFor(
						async () => {
							daemonSessionSnapshot =
								await describeDaemonSessions(diagnosticDaemon);
							return readPositivePidFile(pidPath) !== null;
						},
						10_000,
						() =>
							terminalStartupFailureMessage({
								reason: "detached helper pid file was not created",
								pidPath,
								shell,
								initialCommand,
								daemonSessionSnapshot,
								terminalExit,
								terminalOutput,
								daemonStdout,
								daemonStderr,
							}),
					);
					helperPid = readPositivePidFile(pidPath);
				}
				expect(helperPid).not.toBeNull();
				expect(isPidAlive(helperPid as number)).toBe(true);

				await scenario.host.trpc.terminal.killSession.mutate({
					workspaceId: scenario.workspaceId,
					terminalId,
				});

				await waitFor(() => !isPidAlive(helperPid as number), 10_000);

				await scenario.host.trpc.terminal.launchSession.mutate({
					workspaceId: scenario.workspaceId,
					terminalId: workspaceCleanupTerminalId,
					initialCommand: detachedHelperShellCommand(workspaceCleanupPidPath),
				});

				if (process.platform === "win32") {
					await waitFor(async () => {
						workspaceCleanupHelperPid = await findDaemonSessionPid(
							diagnosticDaemon,
							workspaceCleanupTerminalId,
						);
						return (
							workspaceCleanupHelperPid !== null &&
							isPidAlive(workspaceCleanupHelperPid)
						);
					}, 10_000);
				} else {
					await waitFor(
						() => readPositivePidFile(workspaceCleanupPidPath) !== null,
						10_000,
					);
					workspaceCleanupHelperPid = readPositivePidFile(
						workspaceCleanupPidPath,
					);
				}
				expect(workspaceCleanupHelperPid).not.toBeNull();
				expect(isPidAlive(workspaceCleanupHelperPid as number)).toBe(true);

				__resetSessionsForTesting();
				const disposed = await disposeSessionsByWorkspaceId(
					scenario.workspaceId,
					scenario.host.db,
				);
				expect(disposed.failed).toBe(0);
				expect(disposed.terminated).toBeGreaterThanOrEqual(1);

				await waitFor(
					() => !isPidAlive(workspaceCleanupHelperPid as number),
					10_000,
				);
			} finally {
				diagnosticUnsubscribe?.();
				await diagnosticDaemon?.dispose().catch(() => {});
				if (helperPid !== null && helperPid > 0 && isPidAlive(helperPid)) {
					try {
						process.kill(helperPid, "SIGKILL");
					} catch {
						// Already gone.
					}
				}
				if (
					workspaceCleanupHelperPid !== null &&
					workspaceCleanupHelperPid > 0 &&
					isPidAlive(workspaceCleanupHelperPid)
				) {
					try {
						process.kill(workspaceCleanupHelperPid, "SIGKILL");
					} catch {
						// Already gone.
					}
				}
				await disposeDaemonClient();
				await stopDaemonProcess(daemonProcess);
				rmSync(tmp, { recursive: true, force: true });
			}
		},
	);

	test("resource sessions are daemon-sourced and joined to active DB rows", () => {
		const activeTerminalId = randomUUID();
		const disposedTerminalId = randomUUID();
		const exitedTerminalId = randomUUID();
		const orphanTerminalId = randomUUID();
		const fractionalPidTerminalId = randomUUID();
		const unknownTerminalId = randomUUID();
		seedTerminalSession(scenario.host, {
			id: activeTerminalId,
			originWorkspaceId: scenario.workspaceId,
		});
		seedTerminalSession(scenario.host, {
			id: disposedTerminalId,
			originWorkspaceId: scenario.workspaceId,
			status: "disposed",
		});
		seedTerminalSession(scenario.host, {
			id: exitedTerminalId,
			originWorkspaceId: scenario.workspaceId,
			status: "exited",
		});
		seedTerminalSession(scenario.host, {
			id: orphanTerminalId,
			originWorkspaceId: null,
		});
		seedTerminalSession(scenario.host, {
			id: fractionalPidTerminalId,
			originWorkspaceId: scenario.workspaceId,
		});

		const sessions = listTerminalResourceSessions(
			scenario.host.db,
			[
				{
					id: activeTerminalId,
					pid: 123,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: disposedTerminalId,
					pid: 124,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: exitedTerminalId,
					pid: 125,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: orphanTerminalId,
					pid: 126,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: unknownTerminalId,
					pid: 127,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: fractionalPidTerminalId,
					pid: 128.5,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: activeTerminalId,
					pid: 129,
					cols: 80,
					rows: 24,
					alive: false,
				},
			],
			new Map([[activeTerminalId, "Claude Code"]]),
		);

		expect(sessions).toEqual([
			{
				terminalId: activeTerminalId,
				workspaceId: scenario.workspaceId,
				pid: 123,
				title: "Claude Code",
			},
		]);
	});
});

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function detachedHelperScript(pidPath: string): string {
	return [
		"set -m",
		`${shellQuote(process.execPath)} -e ${shellQuote("process.on('SIGHUP', () => {}); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);")} >/dev/null 2>&1 & helper_pid=$!`,
		`echo "$helper_pid" > ${shellQuote(pidPath)}`,
		"sleep 60",
	].join("; ");
}

function platformTestShell(): string {
	return process.platform === "win32" ? windowsCmdPath() : "/bin/sh";
}

function detachedHelperShellCommand(pidPath: string): string {
	if (process.platform !== "win32") {
		return `/bin/bash -lc ${shellQuote(detachedHelperScript(pidPath))}`;
	}

	return "ping -n 61 127.0.0.1 >NUL";
}

function windowsCmdPath(): string {
	if (process.env.ComSpec) return process.env.ComSpec;
	const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
	return join(systemRoot, "System32", "cmd.exe");
}

function testPathEnv(): Record<string, string> {
	const pathValue = process.env.Path ?? process.env.PATH ?? "/usr/bin:/bin";
	return process.platform === "win32"
		? { PATH: pathValue, Path: pathValue }
		: { PATH: pathValue };
}

function createFakePty(
	pid: number,
	meta: {
		shell: string;
		argv: string[];
		cwd?: string;
		env?: Record<string, string>;
		cols: number;
		rows: number;
	},
) {
	let currentMeta = meta;
	const exitCallbacks: Array<
		(info: { code: number | null; signal: number | null }) => void
	> = [];

	return {
		pid,
		get meta() {
			return currentMeta;
		},
		write() {},
		resize(cols: number, rows: number) {
			currentMeta = { ...currentMeta, cols, rows };
		},
		kill() {
			for (const callback of exitCallbacks.splice(0)) {
				callback({ code: null, signal: null });
			}
		},
		onData() {},
		onExit(
			callback: (info: { code: number | null; signal: number | null }) => void,
		) {
			exitCallbacks.push(callback);
		},
		getMasterFd() {
			return 0;
		},
	};
}

function ensureDaemonBundle(bundlePath: string): void {
	const packageDir = fileURLToPath(
		new URL("../../../pty-daemon", import.meta.url),
	);
	const result = spawnSync("bun", ["run", "build:daemon"], {
		cwd: packageDir,
		encoding: "utf8",
	});
	if (result.status === 0) {
		if (!existsSync(bundlePath)) {
			throw new Error(`pty-daemon bundle was not created: ${bundlePath}`);
		}
		return;
	}
	throw new Error(
		[
			"failed to build pty-daemon bundle for integration test",
			`exitCode: ${result.status}`,
			`stdout:\n${result.stdout}`,
			`stderr:\n${result.stderr}`,
		].join("\n"),
	);
}

function readPositivePidFile(filePath: string): number | null {
	if (!existsSync(filePath)) return null;
	const raw = readFileSync(filePath, "utf8").trim();
	if (!/^\d+$/.test(raw)) return null;
	const pid = Number(raw);
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs: number,
	message?: () => string,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(message?.() ?? `condition timed out after ${timeoutMs}ms`);
}

async function describeDaemonSessions(
	client: DaemonClient | null,
): Promise<string> {
	if (!client) return "(diagnostic daemon not connected)";
	try {
		return JSON.stringify(await client.list());
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function findDaemonSessionPid(
	client: DaemonClient | null,
	terminalId: string,
): Promise<number | null> {
	if (!client) return null;
	try {
		const session = (await client.list()).find(
			(candidate) => candidate.id === terminalId && candidate.alive,
		);
		return session?.pid ?? null;
	} catch {
		return null;
	}
}

function terminalStartupFailureMessage({
	reason,
	pidPath,
	shell,
	initialCommand,
	daemonSessionSnapshot,
	terminalExit,
	terminalOutput,
	daemonStdout,
	daemonStderr,
}: {
	reason: string;
	pidPath: string;
	shell: string;
	initialCommand: string;
	daemonSessionSnapshot: string;
	terminalExit: string;
	terminalOutput: string;
	daemonStdout: string;
	daemonStderr: string;
}): string {
	return [
		reason,
		`pidPath: ${pidPath}`,
		`shell: ${shell}`,
		`initialCommand: ${initialCommand}`,
		`daemonSessions: ${daemonSessionSnapshot}`,
		`terminalExit: ${terminalExit || "(none)"}`,
		`terminalOutput:\n${terminalOutput || "(none)"}`,
		`daemon stdout:\n${daemonStdout}`,
		`daemon stderr:\n${daemonStderr}`,
	].join("\n");
}

function tail(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : value.slice(-maxLength);
}

function isWindowsNamedPipe(socketPath: string): boolean {
	return process.platform === "win32" && /^\\\\[.?]\\pipe\\/i.test(socketPath);
}

function canConnect(socketPath: string): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.createConnection({ path: socketPath });
		let settled = false;
		const settle = (value: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve(value);
		};
		const timeout = setTimeout(() => {
			socket.destroy();
			settle(false);
		}, 200);
		socket.once("connect", () => {
			socket.end();
			settle(true);
		});
		socket.once("error", () => {
			settle(false);
		});
	});
}

async function stopDaemonProcess(child: ChildProcess | null): Promise<void> {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	child.kill("SIGTERM");
	if (await waitForProcessExit(child, 1000)) return;
	child.kill("SIGKILL");
	await waitForProcessExit(child, 1000);
}

async function waitForProcessExit(
	child: ChildProcess,
	timeoutMs: number,
): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return true;
	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			cleanup();
			resolve(false);
		}, timeoutMs);
		const onExit = () => {
			cleanup();
			resolve(true);
		};
		const cleanup = () => {
			clearTimeout(timeout);
			child.off("exit", onExit);
		};
		child.once("exit", onExit);
	});
}
