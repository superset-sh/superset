import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@superset/pty-daemon";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { getProjectConfigPath } from "../../src/runtime/setup/config";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

describe("setup scripts integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		__resetSessionsForTesting();
		await disposeDaemonClient();
		resetTerminalBaseEnvForTests();
		__setAccountShellForTesting(undefined);
		delete process.env.SUPERSET_PTY_DAEMON_SOCKET;
		delete process.env.SUPERSET_HOME_DIR;

		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("v2 settings config is the same config used by workspace setup terminals", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		const daemonRoot = mkdtempSync(join(tmpdir(), "setup-scripts-daemon-"));
		const socketPath = join(daemonRoot, "pty-daemon.sock");
		const writes: string[] = [];
		const spawned: Array<{
			meta: {
				cwd?: string;
				env?: Record<string, string>;
			};
		}> = [];

		const server = new Server({
			socketPath,
			daemonVersion: "0.0.0-setup-scripts-test",
			spawnPty: ({ meta }) => {
				spawned.push({ meta });
				return createFakePty(5200 + spawned.length, writes);
			},
		});

		dispose = async () => {
			await server.close();
			rmSync(daemonRoot, { recursive: true, force: true });
			await scenario.dispose();
		};

		await server.listen();
		process.env.SUPERSET_PTY_DAEMON_SOCKET = socketPath;
		process.env.SUPERSET_HOME_DIR = daemonRoot;
		__setAccountShellForTesting("/bin/sh");
		initTerminalBaseEnv({
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			HOME: daemonRoot,
			SHELL: "/bin/sh",
		});

		const emptyConfig = await scenario.host.trpc.config.getConfigContent.query({
			projectId: scenario.projectId,
		});
		expect(emptyConfig).toEqual({ content: null, exists: false });

		await scenario.host.trpc.config.updateConfig.mutate({
			projectId: scenario.projectId,
			setup: ["echo setup-a", "echo setup-b"],
			teardown: ["echo teardown"],
			run: ["bun dev"],
		});

		const configPath = getProjectConfigPath(scenario.repo.repoPath);
		const diskConfig = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(diskConfig).toEqual({
			setup: ["echo setup-a", "echo setup-b"],
			teardown: ["echo teardown"],
			run: ["bun dev"],
		});

		const readBack = await scenario.host.trpc.config.getConfigContent.query({
			projectId: scenario.projectId,
		});
		expect(readBack.exists).toBe(true);
		expect(JSON.parse(readBack.content ?? "{}")).toEqual(diskConfig);

		await expect(
			scenario.host.trpc.config.shouldShowSetupCard.query({
				projectId: scenario.projectId,
			}),
		).resolves.toBe(false);

		await expect(
			scenario.host.trpc.config.getWorkspaceRunDefinition.query({
				projectId: scenario.projectId,
			}),
		).resolves.toEqual({
			source: "project-config",
			projectId: scenario.projectId,
			commands: ["bun dev"],
		});

		const created = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "scripted setup",
			branch: "scripted-setup",
		});

		expect(created.terminals).toHaveLength(1);
		expect(created.terminals[0]?.label).toBe("Workspace Setup");

		await waitFor(
			() => writes.includes("echo setup-a && echo setup-b\n"),
			5000,
			() => `expected setup command write, got ${JSON.stringify(writes)}`,
		);

		const workspaceRow = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, created.workspace.id))
			.get();
		expect(workspaceRow).toBeDefined();
		if (!workspaceRow) throw new Error("Expected workspace row to exist");

		const setupTerminal = spawned.at(-1);
		expect(setupTerminal).toBeDefined();
		if (!setupTerminal)
			throw new Error("Expected setup terminal to be spawned");

		expect(setupTerminal.meta.cwd).toBe(workspaceRow.worktreePath);
		expect(setupTerminal.meta.env?.SUPERSET_ROOT_PATH).toBe(
			scenario.repo.repoPath,
		);
	});
});

function createFakePty(pid: number, writes: string[]) {
	const exitCallbacks: Array<
		(info: { code: number | null; signal: number | null }) => void
	> = [];

	return {
		pid,
		write(data: string | Uint8Array) {
			writes.push(
				typeof data === "string" ? data : Buffer.from(data).toString("utf-8"),
			);
		},
		resize() {},
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
