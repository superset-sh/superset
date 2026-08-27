import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildV2TerminalEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
	resolveLaunchShell,
	shellLaunchExpectsReadyMarker,
} from "../../terminal/env.ts";
import { getHostAgentHookUrl, HostRuntime } from "./host-runtime.ts";
import { getWorkspaceRuntime } from "./registry.ts";

const ENV_KEYS = [
	"SUPERSET_HOME_DIR",
	"HOST_SERVICE_PORT",
	"PORT",
	"SUPERSET_AGENT_HOOK_PORT",
	"SUPERSET_AGENT_HOOK_VERSION",
] as const;

const BASE_ENV = {
	SHELL: "/bin/bash",
	HOME: "/Users/someone",
	LANG: "en_US.UTF-8",
	PATH: "/usr/bin:/bin",
};

// Satisfies the default-account lookup (`db.select().from(hostSettings).get()`)
// with "no selection", so the launch env gets no account overlay.
const FAKE_DB = {
	select: () => ({ from: () => ({ get: () => undefined }) }),
	query: {
		workspaces: { findFirst: () => ({ sync: () => undefined }) },
		projects: { findFirst: () => ({ sync: () => undefined }) },
	},
} as unknown as Parameters<typeof getWorkspaceRuntime>[0];

const LAUNCH_CONTEXT = {
	terminalId: "term-1",
	workspaceId: "ws-1",
	workspacePath: "/tmp/worktrees/ws-1",
	rootPath: "/tmp/repo",
	cwd: "/tmp/worktrees/ws-1/sub",
	themeType: "light" as const,
	db: FAKE_DB,
};

describe("HostRuntime", () => {
	let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;
	let homeDir: string;

	beforeEach(() => {
		savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
		homeDir = mkdtempSync(path.join(tmpdir(), "superset-host-runtime-"));
		mkdirSync(path.join(homeDir, "bash"), { recursive: true });
		// Same literal the desktop bash wrapper writes; shell-launch checks for
		// this exact marker text to report readiness support.
		writeFileSync(
			path.join(homeDir, "bash", "rcfile"),
			`printf '\\033]133;A\\007'\n`,
		);
		process.env.SUPERSET_HOME_DIR = homeDir;
		process.env.HOST_SERVICE_PORT = "48123";
		process.env.SUPERSET_AGENT_HOOK_PORT = "51741";
		process.env.SUPERSET_AGENT_HOOK_VERSION = "4";
		resetTerminalBaseEnvForTests();
		initTerminalBaseEnv(BASE_ENV);
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			const value = savedEnv[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		resetTerminalBaseEnvForTests();
		rmSync(homeDir, { recursive: true, force: true });
	});

	test("buildPtyLaunch reproduces the pre-refactor daemon.open spec exactly", async () => {
		const spec = await new HostRuntime().buildPtyLaunch(LAUNCH_CONTEXT);

		// Expected spec built the way createTerminalSessionInternal did inline
		// before the runtime extraction, from the same primitives.
		const baseEnv = getTerminalBaseEnv();
		const shell = resolveLaunchShell(baseEnv);
		const expectedEnv = buildV2TerminalEnv({
			baseEnv,
			shell,
			supersetHomeDir: homeDir,
			organizationId: process.env.ORGANIZATION_ID || "",
			themeType: LAUNCH_CONTEXT.themeType,
			cwd: LAUNCH_CONTEXT.cwd,
			terminalId: LAUNCH_CONTEXT.terminalId,
			workspaceId: LAUNCH_CONTEXT.workspaceId,
			workspacePath: LAUNCH_CONTEXT.workspacePath,
			rootPath: LAUNCH_CONTEXT.rootPath,
			supersetEnv:
				process.env.NODE_ENV === "development" ? "development" : "production",
			agentHookPort: "51741",
			agentHookVersion: "4",
			hostAgentHookUrl: "http://127.0.0.1:48123/trpc/notifications.hook",
		});

		expect(spec.shell).toBe(shell);
		expect(spec.argv).toEqual(
			getShellLaunchArgs({ shell, supersetHomeDir: homeDir }),
		);
		expect(spec.cwd).toBe(LAUNCH_CONTEXT.cwd);
		expect(spec.env).toEqual(expectedEnv);
		expect(spec.expectsReadyMarker).toBe(
			shellLaunchExpectsReadyMarker({ shell, supersetHomeDir: homeDir }),
		);
	});

	test("injects the workspace context into the PTY env", async () => {
		const spec = await new HostRuntime().buildPtyLaunch(LAUNCH_CONTEXT);

		expect(spec.env.SUPERSET_TERMINAL_ID).toBe("term-1");
		expect(spec.env.SUPERSET_WORKSPACE_ID).toBe("ws-1");
		expect(spec.env.SUPERSET_WORKSPACE_PATH).toBe("/tmp/worktrees/ws-1");
		expect(spec.env.SUPERSET_ROOT_PATH).toBe("/tmp/repo");
		expect(spec.env.SUPERSET_HOME_DIR).toBe(homeDir);
		expect(spec.env.SUPERSET_HOST_AGENT_HOOK_URL).toBe(
			"http://127.0.0.1:48123/trpc/notifications.hook",
		);
		expect(spec.env.PWD).toBe(LAUNCH_CONTEXT.cwd);
	});

	test("getHostAgentHookUrl prefers HOST_SERVICE_PORT and is empty without a port", () => {
		expect(getHostAgentHookUrl()).toBe(
			"http://127.0.0.1:48123/trpc/notifications.hook",
		);
		delete process.env.HOST_SERVICE_PORT;
		process.env.PORT = "4879";
		expect(getHostAgentHookUrl()).toBe(
			"http://127.0.0.1:4879/trpc/notifications.hook",
		);
		delete process.env.PORT;
		expect(getHostAgentHookUrl()).toBe("");
	});

	test("registry resolves unsandboxed workspaces to the shared host runtime", () => {
		// Registry falls back to the host runtime when the workspace row is
		// missing or has sandboxEnabled=false — a fake empty db covers both.
		const runtime = getWorkspaceRuntime(FAKE_DB, "any-workspace");
		expect(runtime.kind).toBe("host");
		expect(runtime).toBe(getWorkspaceRuntime(FAKE_DB, "another-workspace"));
	});
});
