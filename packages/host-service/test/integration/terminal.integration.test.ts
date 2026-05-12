import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRPCClientError } from "@trpc/client";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { listTerminalResourceSessions } from "../../src/terminal/resource-sessions";
import {
	__resetSessionsForTesting,
	disposeSessionsByWorkspaceId,
} from "../../src/terminal/terminal";
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

	test("terminal disposal cleans up background process groups from real daemon sessions", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "host-service-terminal-pgrp-"));
		const socketPath = join(tmp, "pty-daemon.sock");
		const pidPath = join(tmp, "detached-helper.pid");
		const workspaceCleanupPidPath = join(tmp, "workspace-detached-helper.pid");
		const terminalId = randomUUID();
		const workspaceCleanupTerminalId = randomUUID();
		let daemonProcess: ChildProcess | null = null;
		let daemonStdout = "";
		let daemonStderr = "";
		let daemonSpawnError = "";
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
				() => existsSync(socketPath),
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

			await scenario.host.trpc.terminal.createSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId,
			});
			const daemon = await getDaemonClient();
			daemon.input(
				terminalId,
				Buffer.from(
					`/bin/bash -lc ${shellQuote(detachedHelperScript(pidPath))}\n`,
				),
			);

			await waitFor(() => readPositivePidFile(pidPath) !== null, 3000);
			helperPid = readPositivePidFile(pidPath);
			expect(helperPid).not.toBeNull();
			expect(isPidAlive(helperPid as number)).toBe(true);

			await scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId,
			});

			await waitFor(() => !isPidAlive(helperPid as number), 3000);

			await scenario.host.trpc.terminal.createSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId: workspaceCleanupTerminalId,
			});
			daemon.input(
				workspaceCleanupTerminalId,
				Buffer.from(
					`/bin/bash -lc ${shellQuote(detachedHelperScript(workspaceCleanupPidPath))}\n`,
				),
			);

			await waitFor(
				() => readPositivePidFile(workspaceCleanupPidPath) !== null,
				3000,
			);
			workspaceCleanupHelperPid = readPositivePidFile(workspaceCleanupPidPath);
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
				3000,
			);
		} finally {
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
	});

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
	predicate: () => boolean,
	timeoutMs: number,
	message?: () => string,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(message?.() ?? `condition timed out after ${timeoutMs}ms`);
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
