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
import { TRPCClientError } from "@trpc/client";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

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
		let daemonStderr = "";
		let tailPid: number | null = null;
		writeFileSync(logPath, "");

		try {
			daemonProcess = spawn(
				"node",
				[
					"--experimental-strip-types",
					join(process.cwd(), "packages/pty-daemon/src/main.ts"),
					`--socket=${socketPath}`,
				],
				{
					stdio: ["ignore", "ignore", "pipe"],
					env: {
						...process.env,
						SUPERSET_PTY_DAEMON_VERSION: "0.0.0-host-service-terminal-test",
					},
				},
			);
			daemonProcess.stderr?.on("data", (chunk) => {
				daemonStderr += chunk.toString();
			});
			await waitFor(
				() => existsSync(socketPath),
				3000,
				() => `pty-daemon did not create socket; stderr:\n${daemonStderr}`,
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

			await waitFor(() => existsSync(pidPath), 3000);
			tailPid = Number(readFileSync(pidPath, "utf8").trim());
			expect(isPidAlive(tailPid)).toBe(true);

			await scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId,
			});

			await waitFor(() => !isPidAlive(tailPid as number), 3000);
		} finally {
			if (tailPid !== null && isPidAlive(tailPid)) {
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
});

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
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
