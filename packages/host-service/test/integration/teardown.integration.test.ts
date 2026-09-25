import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@superset/pty-daemon";
import { runTeardown } from "../../src/runtime/teardown";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell";
import { createFishLikePtySpawner, shellQuote } from "../helpers/fake-pty";
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
			repoPath: scenario.repo.repoPath,
			projectId: scenario.projectId,
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
