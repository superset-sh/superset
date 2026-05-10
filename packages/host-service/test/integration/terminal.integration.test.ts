import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
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

	test("killSession cleans up background process groups from a real daemon session", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "host-service-terminal-pgrp-"));
		const socketPath = join(tmp, "pty-daemon.sock");
		const logPath = join(tmp, "superset-codex-session.jsonl");
		const pidPath = join(tmp, "tail.pid");
		const terminalId = randomUUID();
		let daemonProcess: ChildProcess | null = null;
		let daemonStdout = "";
		let daemonStderr = "";
		let daemonSpawnError = "";
		let tailPid: number | null = null;
		writeFileSync(logPath, "");

		try {
			const daemonEntryPath = fileURLToPath(
				new URL("../../../pty-daemon/src/main.ts", import.meta.url),
			);
			const daemonArgs = [
				"--experimental-strip-types",
				daemonEntryPath,
				`--socket=${socketPath}`,
			];
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

			const backgroundScript = [
				"set -m",
				`tail -n +1 -F ${shellQuote(logPath)} >/dev/null 2>&1 & tail_pid=$!`,
				`echo "$tail_pid" > ${shellQuote(pidPath)}`,
				"sleep 60",
			].join("; ");

			await scenario.host.trpc.terminal.createSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId,
			});
			const daemon = await getDaemonClient();
			daemon.input(
				terminalId,
				Buffer.from(`/bin/bash -lc ${shellQuote(backgroundScript)}\n`),
			);

			await waitFor(() => readPositivePidFile(pidPath) !== null, 3000);
			tailPid = readPositivePidFile(pidPath);
			expect(tailPid).not.toBeNull();
			expect(isPidAlive(tailPid as number)).toBe(true);

			await scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId,
			});

			await waitFor(() => !isPidAlive(tailPid as number), 3000);
		} finally {
			if (tailPid !== null && tailPid > 0 && isPidAlive(tailPid)) {
				try {
					process.kill(tailPid, "SIGKILL");
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
