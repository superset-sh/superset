import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as nodeFs from "node:fs";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TEST_ROOT = path.join(
	tmpdir(),
	`superset-ensure-agent-hooks-${process.pid}-${Date.now()}`,
);
const TEST_SUPERSET_DIR = path.join(TEST_ROOT, "superset");
const TEST_BIN_DIR = path.join(TEST_SUPERSET_DIR, "bin");
const TEST_HOOKS_DIR = path.join(TEST_SUPERSET_DIR, "hooks");
const TEST_ZSH_DIR = path.join(TEST_SUPERSET_DIR, "zsh");
const TEST_BASH_DIR = path.join(TEST_SUPERSET_DIR, "bash");
const TEST_OPENCODE_CONFIG_DIR = path.join(TEST_HOOKS_DIR, "opencode");
const TEST_OPENCODE_PLUGIN_DIR = path.join(TEST_OPENCODE_CONFIG_DIR, "plugin");
const TEST_CURSOR_GLOBAL_HOOKS_PATH = path.join(
	TEST_ROOT,
	"global",
	"cursor",
	"hooks.json",
);
const TEST_GEMINI_GLOBAL_SETTINGS_PATH = path.join(
	TEST_ROOT,
	"global",
	"gemini",
	"settings.json",
);
let slowCursorWriteEnabled = false;
let slowWriteCalled = false;
let releaseSlowWrite: (() => void) | null = null;
const REAL_WRITE_FILE = nodeFs.promises.writeFile.bind(nodeFs.promises);

mock.module("node:fs", () => ({
	...nodeFs,
	promises: {
		...nodeFs.promises,
		writeFile: async (
			...args: Parameters<typeof nodeFs.promises.writeFile>
		) => {
			const [filePath] = args;
			const normalizedPath = path.resolve(String(filePath));
			if (
				slowCursorWriteEnabled &&
				normalizedPath === path.resolve(TEST_CURSOR_GLOBAL_HOOKS_PATH)
			) {
				slowWriteCalled = true;
				return new Promise<void>((resolve) => {
					releaseSlowWrite = resolve;
				});
			}
			return REAL_WRITE_FILE(...args);
		},
	},
}));

mock.module("./paths", () => ({
	BIN_DIR: TEST_BIN_DIR,
	HOOKS_DIR: TEST_HOOKS_DIR,
	ZSH_DIR: TEST_ZSH_DIR,
	BASH_DIR: TEST_BASH_DIR,
	OPENCODE_CONFIG_DIR: TEST_OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR: TEST_OPENCODE_PLUGIN_DIR,
}));

mock.module("./notify-hook", () => ({
	NOTIFY_SCRIPT_MARKER: "# Superset notify hook v1",
	getNotifyScriptPath: () => path.join(TEST_HOOKS_DIR, "notify.sh"),
	getNotifyScriptContent: () => "# Superset notify hook v1\necho notify\n",
}));

mock.module("./shell-wrappers", () => ({
	SHELL_WRAPPER_MARKER: "# Superset shell-wrapper v2",
	getZshProfilePath: () => path.join(TEST_ZSH_DIR, ".zprofile"),
	getZshProfileContent: () => "# Superset shell-wrapper v2\n# zprofile\n",
	getZshRcPath: () => path.join(TEST_ZSH_DIR, ".zshrc"),
	getZshRcContent: () => "# Superset shell-wrapper v2\n# zshrc\n",
	getZshLoginPath: () => path.join(TEST_ZSH_DIR, ".zlogin"),
	getZshLoginContent: () => "# Superset shell-wrapper v2\n# zlogin\n",
	getBashRcfilePath: () => path.join(TEST_BASH_DIR, "rcfile"),
	getBashRcfileContent: () => "# Superset shell-wrapper v2\n# bash rcfile\n",
}));

mock.module("./agent-wrappers", () => ({
	WRAPPER_MARKER: "# Superset agent-wrapper v1",
	OPENCODE_PLUGIN_MARKER: "// Superset opencode plugin v8",
	CURSOR_HOOK_MARKER: "# Superset cursor hook v1",
	GEMINI_HOOK_MARKER: "# Superset gemini hook v1",
	COPILOT_HOOK_MARKER: "# Superset copilot hook v1",
	cleanupGlobalOpenCodePlugin: () => {},
	buildCopilotWrapperExecLine: () => 'exec "$REAL_BIN" "$@"',
	buildWrapperScript: (_binaryName: string, execLine: string) =>
		`#!/bin/bash\n# Superset agent-wrapper v1\n${execLine}\n`,
	getWrapperPath: (binaryName: string) => path.join(TEST_BIN_DIR, binaryName),
	getClaudeSettingsPath: () =>
		path.join(TEST_HOOKS_DIR, "claude-settings.json"),
	getClaudeSettingsContent: (notifyPath: string) =>
		JSON.stringify({
			hooks: {
				Stop: [{ hooks: [{ type: "command", command: notifyPath }] }],
			},
		}),
	getOpenCodePluginPath: () =>
		path.join(TEST_OPENCODE_PLUGIN_DIR, "superset-notify.js"),
	getOpenCodePluginContent: (notifyPath: string) =>
		`// Superset opencode plugin v8\n// ${notifyPath}\n`,
	getCursorHookScriptPath: () => path.join(TEST_HOOKS_DIR, "cursor-hook.sh"),
	getCursorHookScriptContent: () =>
		"# Superset cursor hook v1\necho cursor-hook\n",
	getCursorGlobalHooksJsonPath: () => TEST_CURSOR_GLOBAL_HOOKS_PATH,
	getCursorHooksJsonContent: () =>
		JSON.stringify({ version: 1, hooks: { stop: [{ command: "cursor" }] } }),
	getGeminiHookScriptPath: () => path.join(TEST_HOOKS_DIR, "gemini-hook.sh"),
	getGeminiHookScriptContent: () =>
		"# Superset gemini hook v1\necho gemini-hook\n",
	getGeminiSettingsJsonPath: () => TEST_GEMINI_GLOBAL_SETTINGS_PATH,
	getGeminiSettingsJsonContent: () =>
		JSON.stringify({
			hooks: { AfterAgent: [{ hooks: [{ command: "gemini" }] }] },
		}),
	getCopilotHookScriptPath: () => path.join(TEST_HOOKS_DIR, "copilot-hook.sh"),
	getCopilotHookScriptContent: () =>
		"# Superset copilot hook v1\necho copilot-hook\n",
}));

const { ensureAgentHooks } = await import("./ensure-agent-hooks");

describe("ensure-agent-hooks", () => {
	beforeEach(() => {
		mkdirSync(TEST_ROOT, { recursive: true });
	});

	afterEach(() => {
		slowCursorWriteEnabled = false;
		releaseSlowWrite?.();
		releaseSlowWrite = null;
		slowWriteCalled = false;
		mock.restore();
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("resolves without waiting for slow external tool settings writes", async () => {
		slowCursorWriteEnabled = true;

		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const result = await Promise.race([
			ensureAgentHooks().then(() => "resolved" as const),
			new Promise<"timeout">((resolve) => {
				timeoutId = setTimeout(() => resolve("timeout"), 1000);
			}),
		]);

		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		releaseSlowWrite?.();

		expect(slowWriteCalled).toBe(true);
		expect(result).toBe("resolved");
		expect(existsSync(path.join(TEST_BIN_DIR, "codex"))).toBe(true);
		expect(existsSync(path.join(TEST_ZSH_DIR, ".zshrc"))).toBe(true);
	});
});
