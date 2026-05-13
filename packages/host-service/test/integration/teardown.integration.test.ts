import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server, type ServerOptions } from "@superset/pty-daemon";
import { runTeardown } from "../../src/runtime/teardown";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

describe("runTeardown integration", () => {
	let scenario: BasicScenario | null = null;
	let server: Server | null = null;
	let tmp: string | null = null;

	afterEach(async () => {
		__resetSessionsForTesting();
		await disposeDaemonClient();
		resetTerminalBaseEnvForTests();
		__setAccountShellForTesting(undefined);
		delete process.env.SUPERSET_PTY_DAEMON_SOCKET;
		delete process.env.SUPERSET_HOME_DIR;
		if (server) {
			await server.close().catch(() => {});
			server = null;
		}
		if (scenario) {
			await scenario.dispose();
			scenario = null;
		}
		if (tmp) {
			rmSync(tmp, { recursive: true, force: true });
			tmp = null;
		}
	});

	test("hidden teardown terminal exits under fish instead of timing out", async () => {
		tmp = mkdtempSync(join(tmpdir(), "host-service-teardown-it-"));
		const socketPath = join(tmp, "pty-daemon.sock");
		const writes: string[] = [];
		server = new Server({
			socketPath,
			daemonVersion: "0.0.0-teardown-integration-test",
			spawnPty: createFishLikePtySpawner(writes),
		});
		await server.listen();

		process.env.SUPERSET_PTY_DAEMON_SOCKET = socketPath;
		process.env.SUPERSET_HOME_DIR = tmp;
		__setAccountShellForTesting("/bin/fish");
		initTerminalBaseEnv({
			HOME: process.env.HOME ?? tmp,
			LANG: "en_US.UTF-8",
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			SHELL: "/bin/bash",
		});

		scenario = await createBasicScenario();
		const scriptDir = join(scenario.repo.repoPath, ".superset");
		const markerPath = join(scenario.repo.repoPath, "teardown-marker.txt");
		mkdirSync(scriptDir, { recursive: true });
		writeFileSync(
			join(scriptDir, "teardown.sh"),
			`#!/usr/bin/env bash\nprintf ran > ${shellQuote(markerPath)}\n`,
			{ mode: 0o755 },
		);

		const startedAt = Date.now();
		const result = await runTeardown({
			db: scenario.host.db,
			workspaceId: scenario.workspaceId,
			worktreePath: scenario.repo.repoPath,
			timeoutMs: 3_000,
		});

		expect(Date.now() - startedAt).toBeLessThan(3_000);
		expect(result.status).toBe("ok");
		expect(writes).toHaveLength(1);
		expect(writes[0]).toStartWith("exec bash ");
		expect(writes[0]).not.toContain("$?");
		expect(existsSync(markerPath)).toBe(true);
	});
});

function createFishLikePtySpawner(
	writes: string[],
): NonNullable<ServerOptions["spawnPty"]> {
	return ({ meta }) => {
		let dataCallback: ((data: Buffer) => void) | null = null;
		let exitCallback:
			| ((info: { code: number | null; signal: number | null }) => void)
			| null = null;

		queueMicrotask(() => {
			// OSC 133;A — shell-integration prompt-start marker the terminal
			// session waits for before sending the initial command.
			dataCallback?.(Buffer.from("\x1b]133;A\x07"));
		});

		return {
			pid: 42,
			meta,
			write(data) {
				const command = data.toString("utf8").trim();
				writes.push(command);
				if (command.includes("$?")) {
					dataCallback?.(
						Buffer.from(
							"fish: $? is not the exit status. In fish, please use $status.\n",
						),
					);
					return;
				}

				const child = spawnSync("/bin/sh", ["-c", command], {
					cwd: meta.cwd,
					env: meta.env,
				});
				if (child.stdout.byteLength > 0) dataCallback?.(child.stdout);
				if (child.stderr.byteLength > 0) dataCallback?.(child.stderr);
				exitCallback?.({ code: child.status ?? 1, signal: null });
			},
			resize(cols, rows) {
				meta.cols = cols;
				meta.rows = rows;
			},
			kill(signal) {
				exitCallback?.({ code: null, signal: signal === "SIGKILL" ? 9 : 1 });
			},
			onData(cb) {
				dataCallback = cb;
			},
			onExit(cb) {
				exitCallback = cb;
			},
			getMasterFd() {
				return 0;
			},
		};
	};
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
