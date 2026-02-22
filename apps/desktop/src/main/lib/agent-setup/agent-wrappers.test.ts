import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TEST_ROOT = path.join(
	tmpdir(),
	`superset-agent-wrappers-${process.pid}-${Date.now()}`,
);
const TEST_BIN_DIR = path.join(TEST_ROOT, "superset", "bin");
const TEST_HOOKS_DIR = path.join(TEST_ROOT, "superset", "hooks");
const TEST_ZSH_DIR = path.join(TEST_ROOT, "superset", "zsh");
const TEST_BASH_DIR = path.join(TEST_ROOT, "superset", "bash");
const TEST_OPENCODE_CONFIG_DIR = path.join(TEST_HOOKS_DIR, "opencode");
const TEST_OPENCODE_PLUGIN_DIR = path.join(TEST_OPENCODE_CONFIG_DIR, "plugin");
let mockedHomeDir = path.join(TEST_ROOT, "home");

mock.module("shared/env.shared", () => ({
	env: {
		DESKTOP_NOTIFICATIONS_PORT: 7777,
	},
	getWorkspaceName: () => undefined,
}));

mock.module("./notify-hook", () => ({
	NOTIFY_SCRIPT_NAME: "notify.sh",
	NOTIFY_SCRIPT_MARKER: "# Superset agent notification hook",
	getNotifyScriptPath: () => path.join(TEST_HOOKS_DIR, "notify.sh"),
	getNotifyScriptContent: () => "#!/bin/bash\nexit 0\n",
	createNotifyScript: () => {},
}));

mock.module("./paths", () => ({
	BIN_DIR: TEST_BIN_DIR,
	HOOKS_DIR: TEST_HOOKS_DIR,
	ZSH_DIR: TEST_ZSH_DIR,
	BASH_DIR: TEST_BASH_DIR,
	OPENCODE_CONFIG_DIR: TEST_OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR: TEST_OPENCODE_PLUGIN_DIR,
}));

mock.module("node:os", () => ({
	default: {
		homedir: () => mockedHomeDir,
	},
}));

const {
	buildCopilotWrapperExecLine,
	buildWrapperScript,
	getCursorHooksJsonContent,
	getCopilotHookScriptPath,
	getGeminiSettingsJsonContent,
} = await import("./agent-wrappers");

describe("agent-wrappers copilot", () => {
	beforeEach(() => {
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("rewrites stale superset-notify.json with current hook path", () => {
		const projectDir = path.join(TEST_ROOT, "project");
		const hooksDir = path.join(projectDir, ".github", "hooks");
		const hookFile = path.join(hooksDir, "superset-notify.json");
		const gitInfoDir = path.join(projectDir, ".git", "info");
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCopilot = path.join(realBinDir, "copilot");
		const wrapperPath = path.join(TEST_BIN_DIR, "copilot");
		const hookScriptPath = getCopilotHookScriptPath();

		mkdirSync(hooksDir, { recursive: true });
		mkdirSync(gitInfoDir, { recursive: true });
		mkdirSync(realBinDir, { recursive: true });

		writeFileSync(hookScriptPath, "#!/bin/bash\nexit 0\n", { mode: 0o755 });
		writeFileSync(hookFile, '{"superset":"old","bash":"/tmp/old-hook.sh"}');

		writeFileSync(realCopilot, "#!/bin/bash\necho real-copilot\n", {
			mode: 0o755,
		});
		chmodSync(realCopilot, 0o755);

		const wrapperScript = buildWrapperScript(
			"copilot",
			buildCopilotWrapperExecLine(),
		);
		writeFileSync(wrapperPath, wrapperScript, { mode: 0o755 });
		chmodSync(wrapperPath, 0o755);

		execFileSync(wrapperPath, [], {
			cwd: projectDir,
			env: {
				...process.env,
				PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
				SUPERSET_TAB_ID: "tab-1",
			},
			encoding: "utf-8",
		});

		const updated = readFileSync(hookFile, "utf-8");
		expect(updated).toContain(hookScriptPath);
		expect(updated).not.toContain("/tmp/old-hook.sh");
	});

	it("replaces stale Cursor hook commands from old superset paths", () => {
		const homeDir = path.join(TEST_ROOT, "home");
		const cursorHooksPath = path.join(homeDir, ".cursor", "hooks.json");
		const staleHookPath = "/tmp/.superset-old/hooks/cursor-hook.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/cursor-hook.sh";

		mockedHomeDir = homeDir;
		mkdirSync(path.dirname(cursorHooksPath), { recursive: true });
		writeFileSync(
			cursorHooksPath,
			JSON.stringify(
				{
					version: 1,
					hooks: {
						beforeSubmitPrompt: [
							{ command: `${staleHookPath} Start` },
							{ command: "/usr/local/bin/custom-hook Start" },
						],
					},
				},
				null,
				2,
			),
		);

		const content = getCursorHooksJsonContent(currentHookPath);
		const parsed = JSON.parse(content) as {
			hooks: Record<string, Array<{ command: string }>>;
		};
		const beforeSubmitPrompt = parsed.hooks.beforeSubmitPrompt;

		expect(
			beforeSubmitPrompt.some(
				(entry) => entry.command === `${currentHookPath} Start`,
			),
		).toBe(true);
		expect(
			beforeSubmitPrompt.some((entry) => entry.command.includes(staleHookPath)),
		).toBe(false);
		expect(
			beforeSubmitPrompt.some(
				(entry) => entry.command === "/usr/local/bin/custom-hook Start",
			),
		).toBe(true);
	});

	it("replaces stale Gemini hook commands from old superset paths", () => {
		const homeDir = path.join(TEST_ROOT, "home");
		const geminiSettingsPath = path.join(homeDir, ".gemini", "settings.json");
		const staleHookPath = "/tmp/.superset-old/hooks/gemini-hook.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/gemini-hook.sh";

		mockedHomeDir = homeDir;
		mkdirSync(path.dirname(geminiSettingsPath), { recursive: true });
		writeFileSync(
			geminiSettingsPath,
			JSON.stringify(
				{
					hooks: {
						BeforeAgent: [
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
							{
								hooks: [{ type: "command", command: "/opt/custom-hook.sh" }],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const content = getGeminiSettingsJsonContent(currentHookPath);
		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{ hooks: Array<{ type: string; command: string }> }>
			>;
		};
		const beforeAgent = parsed.hooks.BeforeAgent;

		expect(
			beforeAgent.some(
				(def) =>
					def.hooks?.length === 1 && def.hooks[0]?.command === currentHookPath,
			),
		).toBe(true);
		expect(
			beforeAgent.some((def) =>
				def.hooks.some((hook) => hook.command.includes(staleHookPath)),
			),
		).toBe(false);
		expect(
			beforeAgent.some((def) =>
				def.hooks.some((hook) => hook.command === "/opt/custom-hook.sh"),
			),
		).toBe(true);
	});
});
