import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@superset/pty-daemon";
import { hostAgentConfigs, workspaces } from "../../src/db/schema";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

describe("Local workspace launch retries", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		__resetSessionsForTesting();
		await disposeDaemonClient();
		resetTerminalBaseEnvForTests();
		__setAccountShellForTesting(undefined);
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
		delete process.env.SUPERSET_PTY_DAEMON_SOCKET;
		delete process.env.SUPERSET_HOME_DIR;
	});

	test("replaying Local creation does not launch another command or agent", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		const daemonRoot = mkdtempSync(join(tmpdir(), "local-retry-daemon-"));
		const socketPath = join(daemonRoot, "pty-daemon.sock");
		const writes: string[] = [];
		let spawned = 0;

		const server = new Server({
			socketPath,
			daemonVersion: "0.0.0-local-retry-test",
			spawnPty: () => {
				spawned++;
				return createFakePty(5200 + spawned, writes);
			},
		});

		dispose = async () => {
			await server.close();
			await scenario.dispose();
			rmSync(daemonRoot, { recursive: true, force: true });
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

		const agentId = crypto.randomUUID();
		scenario.host.db
			.insert(hostAgentConfigs)
			.values({
				id: agentId,
				presetId: "custom",
				label: "Audit",
				command: "echo",
				promptTransport: "argv",
				displayOrder: 0,
			})
			.run();
		const id = crypto.randomUUID();
		const input = {
			id,
			projectId: scenario.projectId,
			name: "retried launch",
			command: "echo local-command",
			waitForSetupBeforeAgents: true,
			agents: [{ agent: agentId, prompt: "test prompt" }],
		};
		const created =
			await scenario.host.trpc.workspaces.createLocal.mutate(input);
		const retried =
			await scenario.host.trpc.workspaces.createLocal.mutate(input);
		expect(retried.alreadyExists).toBe(true);
		expect(retried.terminals).toHaveLength(0);
		expect(retried.agents).toHaveLength(0);
		expect(created.agents).toHaveLength(1);
		expect(created.agents[0]?.ok).toBe(true);

		expect(created.terminals).toHaveLength(1);
		expect(created.terminals[0]?.label).toBe("Command");

		await waitFor(
			() =>
				writes.includes("echo local-command") &&
				writes.indexOf("\r") > writes.indexOf("echo local-command"),
			5000,
			() => `expected command write + Enter, got ${JSON.stringify(writes)}`,
		);

		expect(spawned).toBe(2);
		expect(retried.workspace.id).toBe(created.workspace.id);
		expect(scenario.host.db.select().from(workspaces).all()).toHaveLength(1);
	}, 20_000);
});

function createFakePty(pid: number, writes: string[]) {
	const dataCallbacks: Array<(data: Buffer) => void> = [];
	const exitCallbacks: Array<
		(info: { code: number | null; signal: number | null }) => void
	> = [];

	return {
		pid,
		write(data: string | Uint8Array) {
			const text =
				typeof data === "string" ? data : Buffer.from(data).toString("utf-8");
			writes.push(text);
			// Simulate the kernel's canonical-mode echo: an ungated (`/bin/sh`)
			// launch verifies its typed command by watching for this echo and
			// would otherwise burn its whole retype budget against silence.
			const echoed = Buffer.from(text, "utf-8");
			queueMicrotask(() => {
				for (const callback of dataCallbacks) callback(echoed);
			});
		},
		resize() {},
		kill() {
			for (const callback of exitCallbacks.splice(0)) {
				callback({ code: null, signal: null });
			}
		},
		onData(callback: (data: Buffer) => void) {
			dataCallbacks.push(callback);
		},
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
