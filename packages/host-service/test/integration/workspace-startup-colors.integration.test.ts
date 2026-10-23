import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@superset/pty-daemon";
import type { SessionMeta } from "@superset/pty-daemon/protocol";
import type { TerminalColors } from "@superset/shared/terminal-colors";
import { hostAgentConfigs } from "../../src/db/schema";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

const light: TerminalColors = {
	foreground: "#4c4f69",
	background: "#eff1f5",
	cursor: "#dc8a78",
};
const dark: TerminalColors = {
	foreground: "#cdd6f4",
	background: "#1e1e2e",
	cursor: "#f5e0dc",
};

function oscReply(index: number, hex: string) {
	const rgb = hex
		.slice(1)
		.match(/../g)
		?.map((part) => part.repeat(2))
		.join("/");
	return `\x1b]${index};rgb:${rgb}\x1b\\`;
}

function createQueryPty(meta: SessionMeta) {
	let output: (data: Buffer) => void = () => {};
	let exit: (info: { code: number | null; signal: number | null }) => void =
		() => {};
	const replies: string[] = [];
	return {
		pid: 5200,
		meta,
		replies,
		queryColors() {
			output(Buffer.from("\x1b]10;?\x07\x1b]11;?\x07\x1b]12;?\x07"));
		},
		pause() {},
		resume() {},
		dispose() {},
		write(data: string | Uint8Array) {
			const text = Buffer.from(data).toString();
			if (text.startsWith("\x1b]")) replies.push(text);
			else queueMicrotask(() => output(Buffer.from(text)));
		},
		resize(cols: number, rows: number) {
			meta.cols = cols;
			meta.rows = rows;
		},
		kill() {
			exit({ code: null, signal: null });
		},
		onData(callback: typeof output) {
			output = callback;
		},
		onExit(callback: typeof exit) {
			exit = callback;
		},
		getMasterFd() {
			return -1;
		},
	};
}

describe("workspace startup colors before a viewer attaches", () => {
	let dispose: (() => Promise<void>) | undefined;
	const envKeys = ["SUPERSET_PTY_DAEMON_SOCKET", "SUPERSET_HOME_DIR"] as const;
	const previousEnv = Object.fromEntries(
		envKeys.map((key) => [key, process.env[key]]),
	);

	afterEach(async () => {
		__resetSessionsForTesting();
		await disposeDaemonClient();
		resetTerminalBaseEnvForTests();
		__setAccountShellForTesting(undefined);
		await dispose?.();
		dispose = undefined;
		for (const key of envKeys) {
			if (previousEnv[key] === undefined) delete process.env[key];
			else process.env[key] = previousEnv[key];
		}
	});

	for (const mode of [
		"chained",
		"parallel",
		"no-setup",
		"local",
		"session",
	] as const) {
		for (const colors of mode === "chained"
			? [light, dark, undefined]
			: [light]) {
			test(`${mode}: ${colors?.background ?? "legacy default"}`, async () => {
				const scenario = await createProjectScenario({
					hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
				});
				const root = mkdtempSync(join(tmpdir(), "startup-colors-"));
				const socketPath = join(root, "pty.sock");
				const ptys: ReturnType<typeof createQueryPty>[] = [];
				const server = new Server({
					socketPath,
					daemonVersion: "test",
					spawnPty: ({ meta }) => {
						const pty = createQueryPty(meta);
						ptys.push(pty);
						return pty;
					},
				});
				dispose = async () => {
					await server.close();
					await scenario.dispose();
					rmSync(root, { recursive: true, force: true });
				};
				await server.listen();
				process.env.SUPERSET_PTY_DAEMON_SOCKET = socketPath;
				process.env.SUPERSET_HOME_DIR = root;
				__setAccountShellForTesting("/bin/sh");
				initTerminalBaseEnv({
					PATH: process.env.PATH ?? "/usr/bin:/bin",
					HOME: root,
					SHELL: "/bin/sh",
				});
				if (mode === "chained" || mode === "parallel") {
					mkdirSync(join(scenario.repo.repoPath, ".superset"));
					await scenario.repo.commit("setup", {
						".superset/config.json": JSON.stringify({ setup: ["echo setup"] }),
					});
				}
				const agentId = crypto.randomUUID();
				scenario.host.db
					.insert(hostAgentConfigs)
					.values({
						id: agentId,
						presetId: "custom",
						label: "Probe",
						command: "echo",
						promptTransport: "argv",
						displayOrder: 0,
					})
					.run();
				const input = {
					name: "startup colors",
					agents: [{ agent: agentId, prompt: "probe" }],
					command: "echo command",
					colors,
				};
				const result =
					mode === "session"
						? await scenario.host.trpc.workspaces.createSession.mutate(input)
						: await scenario.host.trpc.workspaces.create.mutate({
								...input,
								projectId: scenario.projectId,
								checkout: mode === "local" ? "local" : "worktree",
								waitForSetupBeforeAgents: mode !== "parallel",
							});
				expect(result.agents).toHaveLength(1);
				expect(result.agents[0]?.ok).toBe(true);
				expect(ptys).toHaveLength(mode === "parallel" ? 3 : 2);
				if (mode === "chained") {
					expect(result.terminals[0]?.label).toBe("Workspace Setup");
					expect(result.agents[0]).toMatchObject({
						sessionId: result.terminals[0]?.terminalId,
					});
				}
				const expected = colors ?? {
					foreground: "#ffffff",
					background: "#000000",
					cursor: "#ffffff",
				};
				for (const pty of ptys) {
					pty.queryColors();
					expect(pty.replies).toEqual([
						oscReply(10, expected.foreground),
						oscReply(11, expected.background),
						oscReply(12, expected.cursor),
					]);
				}
			});
		}
	}
});
