import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import * as realOs from "node:os";
import path from "node:path";

const TEST_ROOT = path.join(
	realOs.tmpdir(),
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
	...realOs,
	homedir: () => mockedHomeDir,
	default: {
		...realOs,
		homedir: () => mockedHomeDir,
	},
}));

const {
	AMP_PLUGIN_MARKER,
	createAmpPlugin,
	createAmpWrapper,
	buildCodexWrapperExecLine,
	buildCopilotWrapperExecLine,
	buildWrapperScript,
	createClaudeSettingsJson,
	createCodexHooksJson,
	createCodexWrapper,
	CURSOR_HOOK_MARKER,
	createDroidSettingsJson,
	createDroidWrapper,
	createMastraWrapper,
	createPiExtension,
	getClaudeGlobalSettingsJsonContent,
	getClaudeManagedHookCommand,
	getCodexGlobalHooksJsonContent,
	getCursorHooksJsonContent,
	getCopilotHookScriptPath,
	getDroidSettingsJsonContent,
	GEMINI_HOOK_MARKER,
	getAmpGlobalPluginPath,
	getAmpPluginContent,
	getGeminiSettingsJsonContent,
	getMastraHooksJsonContent,
	getPiExtensionContent,
	getPiExtensionPath,
	PI_EXTENSION_MARKER,
} = await import("./agent-wrappers");
const { reconcileManagedEntries } = await import("./agent-wrappers-common");

const managedClaudeHookCommand = getClaudeManagedHookCommand();

describe("reconcileManagedEntries", () => {
	it("preserves user-managed entries while replacing stale managed entries", () => {
		const result = reconcileManagedEntries({
			current: [
				"/usr/local/bin/custom-hook Start",
				"/tmp/.superset-old/hooks/notify.sh Start",
			],
			desired: ["/tmp/.superset-new/hooks/notify.sh Start"],
			isManaged: (entry: string) => entry.includes("/.superset-"),
			isEquivalent: (entry: string, desired: string) => entry === desired,
		});

		expect(result.entries).toEqual([
			"/usr/local/bin/custom-hook Start",
			"/tmp/.superset-new/hooks/notify.sh Start",
		]);
		expect(result.replacedManagedEntries).toEqual([
			"/tmp/.superset-old/hooks/notify.sh Start",
		]);
	});

	it("reconciles edited managed entries even when a managed hook already exists", () => {
		const result = reconcileManagedEntries({
			current: ["/tmp/.superset-current/hooks/notify.sh Start --debug"],
			desired: ["/tmp/.superset-current/hooks/notify.sh Start"],
			isManaged: (entry: string) => entry.includes("/.superset-"),
			isEquivalent: (entry: string, desired: string) => entry === desired,
		});

		expect(result.entries).toEqual([
			"/tmp/.superset-current/hooks/notify.sh Start",
		]);
		expect(result.replacedManagedEntries).toEqual([
			"/tmp/.superset-current/hooks/notify.sh Start --debug",
		]);
	});
});

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
				SUPERSET_TERMINAL_ID: "terminal-1",
			},
			encoding: "utf-8",
		});

		const updated = readFileSync(hookFile, "utf-8");
		expect(updated).toContain(hookScriptPath);
		expect(updated).not.toContain("/tmp/old-hook.sh");
	});

	it("tails codex's process-scoped TUI session log to drive Start events", () => {
		createCodexWrapper();

		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const wrapper = readFileSync(wrapperPath, "utf-8");

		expect(wrapper).toContain(
			`"$REAL_BIN" --enable hooks -c 'notify=["bash","${path.join(TEST_HOOKS_DIR, "notify.sh")}"]' "$@"`,
		);
		expect(wrapper).toContain('export SUPERSET_AGENT_ID="codex"');

		expect(wrapper).toContain("# Superset agent-wrapper v2");

		// Native hooks remain enabled, but the process-scoped TUI session log is
		// the reliable Start signal for installed Codex TUI builds.
		expect(wrapper).toContain("SUPERSET_CODEX_SESSION_WATCHER_PID");
		expect(wrapper).toContain("CODEX_TUI_RECORD_SESSION");
		expect(wrapper).toContain("CODEX_TUI_SESSION_LOG_PATH");
		expect(wrapper).toContain("SUPERSET_TERMINAL_ID$SUPERSET_TAB_ID");
		expect(wrapper).not.toContain("rollout-*.jsonl");
		expect(wrapper).not.toContain("_superset_sessions_dir");
		expect(wrapper).not.toContain("$" + "{CODEX_HOME:-$HOME/.codex}");
		expect(wrapper).toContain("SUPERSET_HOOK_DEBUG_LOG");
		expect(wrapper).toContain("tail -n +1 -F");
		expect(wrapper).toContain('"UserTurn"');
		expect(wrapper).toContain("_approval_request");

		const execLine = buildCodexWrapperExecLine(
			path.join(TEST_HOOKS_DIR, "notify.sh"),
		);
		expect(execLine).not.toContain("{{NOTIFY_PATH}}");
		expect(wrapper).toContain(execLine);
	});

	it("forwards hooks enablement through the codex wrapper for manual launches", () => {
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCodex = path.join(realBinDir, "codex");
		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const argsFile = path.join(TEST_ROOT, "codex-args.txt");

		mkdirSync(realBinDir, { recursive: true });
		writeFileSync(
			realCodex,
			`#!/bin/bash
printf '%s\n' "$@" > "${argsFile}"
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(realCodex, 0o755);

		createCodexWrapper();

		execFileSync(wrapperPath, ["exec", "Reply with exactly OK."], {
			env: {
				...process.env,
				PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
				SUPERSET_TERMINAL_ID: "terminal-1",
			},
			encoding: "utf-8",
		});

		expect(readFileSync(argsFile, "utf-8")).toBe(
			`${[
				"--enable",
				"hooks",
				"-c",
				`notify=["bash","${path.join(TEST_HOOKS_DIR, "notify.sh")}"]`,
				"exec",
				"Reply with exactly OK.",
			].join("\n")}\n`,
		);
	});

	it("emits codex Start from the wrapper-owned TUI session log", () => {
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCodex = path.join(realBinDir, "codex");
		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const notifyPath = path.join(TEST_HOOKS_DIR, "notify.sh");
		const notifyCapturePath = path.join(TEST_ROOT, "codex-notify-events.txt");
		const debugLogPath = path.join(TEST_ROOT, "codex-debug.log");

		mkdirSync(realBinDir, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
		writeFileSync(
			notifyPath,
			`#!/bin/bash
printf '%s\n' "$1" >> "$NOTIFY_CAPTURE_PATH"
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(notifyPath, 0o755);
		writeFileSync(
			realCodex,
			`#!/bin/bash
set -eu
: > "$CODEX_TUI_SESSION_LOG_PATH"
sleep 0.3
printf '{"dir":"from_tui","kind":"op","payload":{"UserTurn":{"items":[]}}}\n' >> "$CODEX_TUI_SESSION_LOG_PATH"
sleep 0.3
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(realCodex, 0o755);

		createCodexWrapper();

		execFileSync(wrapperPath, [], {
			env: {
				...process.env,
				NOTIFY_CAPTURE_PATH: notifyCapturePath,
				PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
				SUPERSET_DEBUG_HOOKS: "1",
				SUPERSET_HOOK_DEBUG_LOG: debugLogPath,
				SUPERSET_TERMINAL_ID: "terminal-1",
			},
			encoding: "utf-8",
		});

		const notifications = readFileSync(notifyCapturePath, "utf-8");
		expect(notifications).toContain('{"hook_event_name":"Start"}');
		expect(notifications).not.toContain('{"hook_event_name":"Stop"}');

		const debugLog = readFileSync(debugLogPath, "utf-8");
		expect(debugLog).toContain("watching session=");
		expect(debugLog).toContain("emitting Start");
	});

	it("emits codex Start from legacy TUI session logs with v1 tab context", () => {
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCodex = path.join(realBinDir, "codex");
		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const notifyPath = path.join(TEST_HOOKS_DIR, "notify.sh");
		const notifyCapturePath = path.join(
			TEST_ROOT,
			"codex-legacy-notify-events.txt",
		);
		const debugLogPath = path.join(TEST_ROOT, "codex-legacy-debug.log");

		mkdirSync(realBinDir, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
		writeFileSync(
			notifyPath,
			`#!/bin/bash
printf '%s\n' "$1" >> "$NOTIFY_CAPTURE_PATH"
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(notifyPath, 0o755);
		writeFileSync(
			realCodex,
			`#!/bin/bash
set -eu
: > "$CODEX_TUI_SESSION_LOG_PATH"
sleep 0.3
printf '{"dir":"from_tui","kind":"op","payload":{"UserTurn":{"items":[]}}}\n' >> "$CODEX_TUI_SESSION_LOG_PATH"
sleep 0.3
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(realCodex, 0o755);

		createCodexWrapper();

		execFileSync(wrapperPath, [], {
			env: {
				...process.env,
				NOTIFY_CAPTURE_PATH: notifyCapturePath,
				PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
				SUPERSET_DEBUG_HOOKS: "1",
				SUPERSET_HOOK_DEBUG_LOG: debugLogPath,
				SUPERSET_TAB_ID: "tab-1",
			},
			encoding: "utf-8",
		});

		const notifications = readFileSync(notifyCapturePath, "utf-8");
		expect(notifications).toContain('{"hook_event_name":"Start"}');
		expect(notifications).not.toContain('{"hook_event_name":"Stop"}');

		const debugLog = readFileSync(debugLogPath, "utf-8");
		expect(debugLog).toContain("watching session=");
		expect(debugLog).toContain("emitting Start");
		expect(debugLog).toContain("tabId=tab-1");
	});

	it("does not emit codex events from unrelated rollout files", () => {
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCodex = path.join(realBinDir, "codex");
		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const notifyPath = path.join(TEST_HOOKS_DIR, "notify.sh");
		const notifyCapturePath = path.join(
			TEST_ROOT,
			"codex-rollout-notify-events.txt",
		);
		const debugLogPath = path.join(TEST_ROOT, "codex-rollout-debug.log");
		const codexHome = path.join(TEST_ROOT, "custom-codex-home");

		mkdirSync(realBinDir, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
		writeFileSync(
			notifyPath,
			`#!/bin/bash
printf '%s\n' "$1" >> "$NOTIFY_CAPTURE_PATH"
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(notifyPath, 0o755);
		writeFileSync(
			realCodex,
			`#!/bin/bash
set -eu
rollout_dir="$CODEX_HOME/sessions/2026/05/09"
mkdir -p "$rollout_dir"
: > "$CODEX_TUI_SESSION_LOG_PATH"
printf '{"type":"event_msg","payload":{"type":"task_started"}}\n' >> "$rollout_dir/rollout-other.jsonl"
sleep 0.3
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(realCodex, 0o755);

		createCodexWrapper();

		execFileSync(wrapperPath, [], {
			env: {
				...process.env,
				CODEX_HOME: codexHome,
				NOTIFY_CAPTURE_PATH: notifyCapturePath,
				PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
				SUPERSET_DEBUG_HOOKS: "1",
				SUPERSET_HOOK_DEBUG_LOG: debugLogPath,
				SUPERSET_TERMINAL_ID: "terminal-1",
			},
			encoding: "utf-8",
		});

		expect(existsSync(notifyCapturePath)).toBe(false);
		expect(readFileSync(debugLogPath, "utf-8")).toContain("watching session=");
	});

	it("creates mastracode wrapper passthrough", () => {
		createMastraWrapper();

		const wrapperPath = path.join(TEST_BIN_DIR, "mastracode");
		const wrapper = readFileSync(wrapperPath, "utf-8");

		expect(wrapper).toContain("# Superset wrapper for mastracode");
		expect(wrapper).toContain('REAL_BIN="$(find_real_binary "mastracode")"');
		expect(wrapper).toContain('exec "$REAL_BIN" "$@"');
	});

	it("creates amp wrapper passthrough", () => {
		createAmpWrapper();

		const wrapperPath = path.join(TEST_BIN_DIR, "amp");
		const wrapper = readFileSync(wrapperPath, "utf-8");

		expect(wrapper).toContain("# Superset wrapper for amp");
		expect(wrapper).toContain('REAL_BIN="$(find_real_binary "amp")"');
		expect(wrapper).toContain('export SUPERSET_AGENT_ID="amp"');
		expect(wrapper).toContain('exec "$REAL_BIN" "$@"');
	});

	it("creates Amp lifecycle plugin", () => {
		createAmpPlugin();

		const pluginPath = getAmpGlobalPluginPath();
		const plugin = readFileSync(pluginPath, "utf-8");

		expect(pluginPath).toBe(
			path.join(
				mockedHomeDir,
				".config",
				"amp",
				"plugins",
				"superset-lifecycle.ts",
			),
		);
		expect(plugin).toBe(getAmpPluginContent());
		expect(plugin).toContain(AMP_PLUGIN_MARKER);
		expect(plugin).toContain(
			"// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now",
		);
		expect(plugin).toContain('amp.on("session.start"');
		expect(plugin).toContain('notify("SessionStart", event)');
		expect(plugin).toContain('amp.on("agent.start"');
		expect(plugin).toContain('notify("Start", event)');
		expect(plugin).toContain('amp.on("agent.end"');
		expect(plugin).toContain('notify("Stop", event)');
		expect(plugin).toContain('import { spawn } from "node:child_process"');
		expect(plugin).toContain('SUPERSET_AGENT_ID: "amp"');
		expect(plugin).toContain("[superset-amp-plugin]");
		expect(plugin).toContain("SUPERSET_HOME_DIR");
	});

	it("creates droid wrapper passthrough", () => {
		createDroidWrapper();

		const wrapperPath = path.join(TEST_BIN_DIR, "droid");
		const wrapper = readFileSync(wrapperPath, "utf-8");

		expect(wrapper).toContain("# Superset wrapper for droid");
		expect(wrapper).toContain('REAL_BIN="$(find_real_binary "droid")"');
		expect(wrapper).toContain('export SUPERSET_AGENT_ID="droid"');
		expect(wrapper).toContain('exec "$REAL_BIN" "$@"');
	});

	it("replaces stale Cursor hook commands from old superset paths", () => {
		const cursorHooksPath = path.join(mockedHomeDir, ".cursor", "hooks.json");
		const staleHookPath =
			"/tmp/worktree/superset-dev-data/hooks/cursor-hook.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/cursor-hook.sh";

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
		writeFileSync(cursorHooksPath, content);
		const content2 = getCursorHooksJsonContent(currentHookPath);

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
		expect(Array.isArray(parsed.hooks.stop)).toBe(true);
		expect(
			parsed.hooks.sessionStart.some(
				(entry) => entry.command === `${currentHookPath} SessionStart`,
			),
		).toBe(true);
		expect(
			parsed.hooks.sessionEnd.some(
				(entry) => entry.command === `${currentHookPath} SessionEnd`,
			),
		).toBe(true);
		expect(Array.isArray(parsed.hooks.beforeShellExecution)).toBe(true);
		expect(Array.isArray(parsed.hooks.beforeMCPExecution)).toBe(true);
		expect(JSON.parse(content2)).toEqual(JSON.parse(content));
	});

	it("replaces stale Gemini hook commands from old superset paths", () => {
		const geminiSettingsPath = path.join(
			mockedHomeDir,
			".gemini",
			"settings.json",
		);
		const staleHookPath =
			"/tmp/worktree/superset-dev-data/hooks/gemini-hook.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/gemini-hook.sh";

		mkdirSync(path.dirname(geminiSettingsPath), { recursive: true });
		writeFileSync(
			geminiSettingsPath,
			JSON.stringify(
				{
					hooks: {
						BeforeAgent: [
							{
								command: staleHookPath,
							},
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
							{
								hooks: [{ type: "command", command: "/opt/custom-hook.sh" }],
							},
						],
						AfterAgent: [
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
						AfterTool: [
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const content = getGeminiSettingsJsonContent(currentHookPath);
		writeFileSync(geminiSettingsPath, content);
		const content2 = getGeminiSettingsJsonContent(currentHookPath);

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					command?: string;
					hooks?: Array<{ type: string; command: string }>;
				}>
			>;
		};
		const parsed2 = JSON.parse(content2) as {
			hooks: Record<
				string,
				Array<{
					command?: string;
					hooks?: Array<{ type: string; command: string }>;
				}>
			>;
		};

		const eventNames = ["BeforeAgent", "AfterAgent", "AfterTool"] as const;

		for (const eventName of eventNames) {
			const hooks = parsed.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some(
					(def) =>
						def.hooks?.length === 1 &&
						def.hooks[0]?.command === currentHookPath,
				),
			).toBe(true);
			expect(
				hooks.some(
					(def) =>
						def.command?.includes(staleHookPath) ||
						def.hooks?.some((hook) => hook.command.includes(staleHookPath)),
				),
			).toBe(false);
		}

		const beforeAgent = parsed.hooks.BeforeAgent;
		expect(
			beforeAgent.some((def) =>
				def.hooks?.some((hook) => hook.command === "/opt/custom-hook.sh"),
			),
		).toBe(true);

		for (const eventName of eventNames) {
			const hooks = parsed2.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some(
					(def) =>
						def.hooks?.length === 1 &&
						def.hooks[0]?.command === currentHookPath,
				),
			).toBe(true);
			expect(
				hooks.some(
					(def) =>
						def.command?.includes(staleHookPath) ||
						def.hooks?.some((hook) => hook.command.includes(staleHookPath)),
				),
			).toBe(false);
		}
		expect(
			parsed2.hooks.BeforeAgent.some((def) =>
				def.hooks?.some((hook) => hook.command === "/opt/custom-hook.sh"),
			),
		).toBe(true);
		expect(JSON.parse(content2)).toEqual(JSON.parse(content));
	});

	it("bumps Cursor and Gemini hook script markers when hook semantics change", () => {
		expect(CURSOR_HOOK_MARKER).toBe("# Superset cursor hook v2");
		expect(GEMINI_HOOK_MARKER).toBe("# Superset gemini hook v2");
	});

	it("replaces stale Mastra hook commands from old superset paths", () => {
		const mastraHooksPath = path.join(
			mockedHomeDir,
			".mastracode",
			"hooks.json",
		);
		const staleHookPath = "/tmp/.superset-old/hooks/notify.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/notify.sh";

		mkdirSync(path.dirname(mastraHooksPath), { recursive: true });
		writeFileSync(
			mastraHooksPath,
			JSON.stringify(
				{
					UserPromptSubmit: [
						{ type: "command", command: `bash '${staleHookPath}'` },
						{ type: "command", command: "/usr/local/bin/custom-hook" },
					],
					Stop: [{ type: "command", command: `bash '${staleHookPath}'` }],
					PostToolUse: [
						{ type: "command", command: `bash '${staleHookPath}'` },
					],
				},
				null,
				2,
			),
		);

		const content = getMastraHooksJsonContent(currentHookPath);
		writeFileSync(mastraHooksPath, content);
		const content2 = getMastraHooksJsonContent(currentHookPath);

		const parsed = JSON.parse(content) as Record<
			string,
			Array<{ type: string; command: string }>
		>;
		const managedEvents = [
			"SessionStart",
			"SessionEnd",
			"UserPromptSubmit",
			"Stop",
			"PostToolUse",
		] as const;

		for (const eventName of managedEvents) {
			const hooks = parsed[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some(
					(entry) =>
						entry.type === "command" &&
						entry.command ===
							`SUPERSET_AGENT_ID=mastracode bash '${currentHookPath}'`,
				),
			).toBe(true);
			expect(hooks.some((entry) => entry.command.includes(staleHookPath))).toBe(
				false,
			);
		}

		expect(
			parsed.UserPromptSubmit.some(
				(entry) => entry.command === "/usr/local/bin/custom-hook",
			),
		).toBe(true);
		expect(JSON.parse(content2)).toEqual(JSON.parse(content));
	});

	it("replaces stale Droid hook commands from old superset paths", () => {
		const droidSettingsPath = path.join(
			mockedHomeDir,
			".factory",
			"settings.json",
		);
		const staleHookPath = "/tmp/.superset-old/hooks/notify.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/notify.sh";

		mkdirSync(path.dirname(droidSettingsPath), { recursive: true });
		writeFileSync(
			droidSettingsPath,
			JSON.stringify(
				{
					hooks: {
						UserPromptSubmit: [
							{
								hooks: [
									{ type: "command", command: staleHookPath },
									{ type: "command", command: "/opt/custom-prompt.sh" },
								],
							},
						],
						Notification: [
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
						Stop: [
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
						PostToolUse: [
							{
								matcher: "*",
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const content = getDroidSettingsJsonContent(currentHookPath);
		expect(content).not.toBeNull();
		if (content === null) {
			throw new Error("Expected Droid settings content for valid JSON object");
		}
		writeFileSync(droidSettingsPath, content);

		const content2 = getDroidSettingsJsonContent(currentHookPath);
		expect(content2).not.toBeNull();
		if (content2 === null) {
			throw new Error("Expected Droid settings content after rewrite");
		}

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					matcher?: string;
					hooks: Array<{ type: string; command: string }>;
				}>
			>;
		};

		const managedEvents = [
			"UserPromptSubmit",
			"Notification",
			"Stop",
			"PostToolUse",
		] as const;

		for (const eventName of managedEvents) {
			const hooks = parsed.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some(
						(hook) =>
							hook.command === `SUPERSET_AGENT_ID=droid '${currentHookPath}'`,
					),
				),
			).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command.includes(staleHookPath)),
				),
			).toBe(false);
		}

		expect(
			parsed.hooks.UserPromptSubmit.some((def) =>
				def.hooks.some((hook) => hook.command === "/opt/custom-prompt.sh"),
			),
		).toBe(true);
		expect(parsed.hooks.PostToolUse.some((def) => def.matcher === "*")).toBe(
			true,
		);
		expect(JSON.parse(content2)).toEqual(JSON.parse(content));
	});

	it("skips Droid settings writes when the existing JSON is invalid", () => {
		const droidSettingsPath = path.join(
			mockedHomeDir,
			".factory",
			"settings.json",
		);
		const invalidJson = "{not-json";

		mkdirSync(path.dirname(droidSettingsPath), { recursive: true });
		writeFileSync(droidSettingsPath, invalidJson);

		expect(
			getDroidSettingsJsonContent("/tmp/.superset-new/hooks/notify.sh"),
		).toBeNull();

		createDroidSettingsJson();

		expect(readFileSync(droidSettingsPath, "utf-8")).toBe(invalidJson);
	});

	it("skips Droid settings writes when the existing JSON is not an object", () => {
		const droidSettingsPath = path.join(
			mockedHomeDir,
			".factory",
			"settings.json",
		);

		mkdirSync(path.dirname(droidSettingsPath), { recursive: true });
		writeFileSync(droidSettingsPath, JSON.stringify("not-an-object"));

		expect(
			getDroidSettingsJsonContent("/tmp/.superset-new/hooks/notify.sh"),
		).toBeNull();
	});
});

describe("agent-wrappers claude settings.json", () => {
	beforeEach(() => {
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("creates Claude settings.json with hooks when no file exists", () => {
		const notifyPath = "/tmp/.superset/hooks/notify.sh";
		const content = getClaudeGlobalSettingsJsonContent(notifyPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					matcher?: string;
					hooks: Array<{ type: string; command: string }>;
				}>
			>;
		};

		const managedEvents = [
			"UserPromptSubmit",
			"Stop",
			"PostToolUse",
			"PostToolUseFailure",
			"PermissionRequest",
		] as const;

		for (const eventName of managedEvents) {
			const hooks = parsed.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command === managedClaudeHookCommand),
				),
			).toBe(true);
		}

		expect(parsed.hooks.PostToolUse.some((def) => def.matcher === "*")).toBe(
			true,
		);
	});

	it("preserves user hooks and non-hook settings when merging", () => {
		const claudeSettingsPath = path.join(
			mockedHomeDir,
			".claude",
			"settings.json",
		);
		mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
		writeFileSync(
			claudeSettingsPath,
			JSON.stringify(
				{
					permissions: { allow: ["Bash(*)", "Read"] },
					hooks: {
						UserPromptSubmit: [
							{
								hooks: [{ type: "command", command: "/opt/my-custom-hook.sh" }],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const notifyPath = "/tmp/.superset/hooks/notify.sh";
		const content = getClaudeGlobalSettingsJsonContent(notifyPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		const parsed = JSON.parse(content);

		// Preserves non-hook settings
		expect(parsed.permissions).toEqual({ allow: ["Bash(*)", "Read"] });

		// Preserves user hook
		expect(
			parsed.hooks.UserPromptSubmit.some(
				(def: { hooks: Array<{ command: string }> }) =>
					def.hooks.some(
						(hook: { command: string }) =>
							hook.command === "/opt/my-custom-hook.sh",
					),
			),
		).toBe(true);

		// Adds managed hook
		expect(
			parsed.hooks.UserPromptSubmit.some(
				(def: { hooks: Array<{ command: string }> }) =>
					def.hooks.some(
						(hook: { command: string }) =>
							hook.command === managedClaudeHookCommand,
					),
			),
		).toBe(true);
	});

	it("replaces stale Claude hook commands from old superset paths", () => {
		const claudeSettingsPath = path.join(
			mockedHomeDir,
			".claude",
			"settings.json",
		);
		const staleHookPath = "/tmp/.superset-old/hooks/notify.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/notify.sh";

		mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
		writeFileSync(
			claudeSettingsPath,
			JSON.stringify(
				{
					hooks: {
						UserPromptSubmit: [
							{
								hooks: [
									{ type: "command", command: staleHookPath },
									{ type: "command", command: "/opt/custom-prompt.sh" },
								],
							},
						],
						Stop: [
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
						PostToolUse: [
							{
								matcher: "*",
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const content = getClaudeGlobalSettingsJsonContent(currentHookPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		// Second run should be idempotent
		writeFileSync(claudeSettingsPath, content);
		const content2 = getClaudeGlobalSettingsJsonContent(currentHookPath);
		expect(content2).not.toBeNull();

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					matcher?: string;
					hooks: Array<{ type: string; command: string }>;
				}>
			>;
		};

		// Stale hooks removed, current hooks present
		for (const eventName of [
			"UserPromptSubmit",
			"Stop",
			"PostToolUse",
		] as const) {
			const hooks = parsed.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command === managedClaudeHookCommand),
				),
			).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command.includes(staleHookPath)),
				),
			).toBe(false);
		}

		// Custom hook preserved
		expect(
			parsed.hooks.UserPromptSubmit.some((def) =>
				def.hooks.some((hook) => hook.command === "/opt/custom-prompt.sh"),
			),
		).toBe(true);

		// Idempotent
		expect(content2).not.toBeNull();
		expect(JSON.parse(content2 as string)).toEqual(JSON.parse(content));
	});

	it("skips Claude settings writes when existing JSON is invalid", () => {
		const claudeSettingsPath = path.join(
			mockedHomeDir,
			".claude",
			"settings.json",
		);
		const invalidJson = "{not-json";

		mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
		writeFileSync(claudeSettingsPath, invalidJson);

		expect(
			getClaudeGlobalSettingsJsonContent("/tmp/.superset/hooks/notify.sh"),
		).toBeNull();

		createClaudeSettingsJson();

		// Should not have overwritten the file
		expect(readFileSync(claudeSettingsPath, "utf-8")).toBe(invalidJson);
	});

	it("skips Claude settings writes when existing JSON is not an object", () => {
		const claudeSettingsPath = path.join(
			mockedHomeDir,
			".claude",
			"settings.json",
		);

		mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
		writeFileSync(claudeSettingsPath, JSON.stringify("not-an-object"));

		expect(
			getClaudeGlobalSettingsJsonContent("/tmp/.superset/hooks/notify.sh"),
		).toBeNull();
	});
});

describe("agent-wrappers codex hooks.json", () => {
	beforeEach(() => {
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("creates Codex hooks.json with prompt and lifecycle hooks when no file exists", () => {
		const notifyPath = "/tmp/.superset/hooks/notify.sh";
		const content = getCodexGlobalHooksJsonContent(notifyPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					matcher?: string;
					hooks: Array<{ type: string; command: string }>;
				}>
			>;
		};

		const expectedCommand = `SUPERSET_AGENT_ID=codex "${notifyPath}"`;
		for (const eventName of [
			"SessionStart",
			"UserPromptSubmit",
			"Stop",
		] as const) {
			const hooks = parsed.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command === expectedCommand),
				),
			).toBe(true);
		}

		expect(parsed.hooks.PreToolUse).toBeUndefined();
		expect(parsed.hooks.PostToolUse).toBeUndefined();
	});

	it("preserves user hooks when merging", () => {
		const codexHooksPath = path.join(mockedHomeDir, ".codex", "hooks.json");
		mkdirSync(path.dirname(codexHooksPath), { recursive: true });
		writeFileSync(
			codexHooksPath,
			JSON.stringify(
				{
					hooks: {
						UserPromptSubmit: [
							{
								hooks: [
									{
										type: "command",
										command: "/opt/my-custom-prompt-hook.sh",
									},
								],
							},
						],
						PreToolUse: [
							{
								matcher: "*",
								hooks: [
									{
										type: "command",
										command: "/opt/my-custom-pre-tool-hook.sh",
									},
								],
							},
						],
						PostToolUse: [
							{
								matcher: "*",
								hooks: [
									{
										type: "command",
										command: "/opt/my-custom-post-tool-hook.sh",
									},
								],
							},
						],
						Stop: [
							{
								hooks: [{ type: "command", command: "/opt/my-custom-hook.sh" }],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const notifyPath = "/tmp/.superset/hooks/notify.sh";
		const content = getCodexGlobalHooksJsonContent(notifyPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		const parsed = JSON.parse(content);

		// Preserves user hooks (including PreToolUse/PostToolUse which we don't manage)
		expect(
			parsed.hooks.Stop.some((def: { hooks: Array<{ command: string }> }) =>
				def.hooks.some(
					(hook: { command: string }) =>
						hook.command === "/opt/my-custom-hook.sh",
				),
			),
		).toBe(true);
		expect(
			parsed.hooks.UserPromptSubmit.some(
				(def: { hooks: Array<{ command: string }> }) =>
					def.hooks.some(
						(hook: { command: string }) =>
							hook.command === "/opt/my-custom-prompt-hook.sh",
					),
			),
		).toBe(true);
		expect(
			parsed.hooks.PreToolUse.some(
				(def: { hooks: Array<{ command: string }> }) =>
					def.hooks.some(
						(hook: { command: string }) =>
							hook.command === "/opt/my-custom-pre-tool-hook.sh",
					),
			),
		).toBe(true);
		expect(
			parsed.hooks.PostToolUse.some(
				(def: { hooks: Array<{ command: string }> }) =>
					def.hooks.some(
						(hook: { command: string }) =>
							hook.command === "/opt/my-custom-post-tool-hook.sh",
					),
			),
		).toBe(true);

		const expectedManagedCommand = `SUPERSET_AGENT_ID=codex "${notifyPath}"`;
		// Adds managed hooks for SessionStart, UserPromptSubmit, Stop
		for (const eventName of ["SessionStart", "UserPromptSubmit", "Stop"]) {
			expect(
				parsed.hooks[eventName].some(
					(def: { hooks: Array<{ command: string }> }) =>
						def.hooks.some(
							(hook: { command: string }) =>
								hook.command === expectedManagedCommand,
						),
				),
			).toBe(true);
		}

		// Does NOT inject managed hooks for PreToolUse/PostToolUse
		expect(
			parsed.hooks.PreToolUse.some(
				(def: { hooks: Array<{ command: string }> }) =>
					def.hooks.some(
						(hook: { command: string }) =>
							hook.command === expectedManagedCommand,
					),
			),
		).toBe(false);
		expect(
			parsed.hooks.PostToolUse.some(
				(def: { hooks: Array<{ command: string }> }) =>
					def.hooks.some(
						(hook: { command: string }) =>
							hook.command === expectedManagedCommand,
					),
			),
		).toBe(false);
	});

	it("replaces stale Codex hook commands from old superset paths", () => {
		const codexHooksPath = path.join(mockedHomeDir, ".codex", "hooks.json");
		const staleHookPath = "/tmp/.superset-old/hooks/notify.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/notify.sh";

		mkdirSync(path.dirname(codexHooksPath), { recursive: true });
		writeFileSync(
			codexHooksPath,
			JSON.stringify(
				{
					hooks: {
						SessionStart: [
							{
								hooks: [{ type: "command", command: staleHookPath }],
							},
						],
						Stop: [
							{
								hooks: [
									{ type: "command", command: staleHookPath },
									{ type: "command", command: "/opt/custom-stop.sh" },
								],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const content = getCodexGlobalHooksJsonContent(currentHookPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		// Second run should be idempotent
		writeFileSync(codexHooksPath, content);
		const content2 = getCodexGlobalHooksJsonContent(currentHookPath);

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					matcher?: string;
					hooks: Array<{ type: string; command: string }>;
				}>
			>;
		};

		const expectedManagedCommand = `SUPERSET_AGENT_ID=codex "${currentHookPath}"`;
		for (const eventName of [
			"SessionStart",
			"UserPromptSubmit",
			"Stop",
		] as const) {
			const hooks = parsed.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command === expectedManagedCommand),
				),
			).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command.includes(staleHookPath)),
				),
			).toBe(false);
		}

		// Custom hook preserved
		expect(
			parsed.hooks.Stop.some((def) =>
				def.hooks.some((hook) => hook.command === "/opt/custom-stop.sh"),
			),
		).toBe(true);

		// Idempotent
		expect(content2).not.toBeNull();
		expect(JSON.parse(content2 as string)).toEqual(JSON.parse(content));
	});

	it("removes stale Superset-managed UserPromptSubmit hooks without touching user hooks", () => {
		const codexHooksPath = path.join(mockedHomeDir, ".codex", "hooks.json");
		const staleHookPath =
			"/Users/test/.superset/worktrees/repo/superset-dev-data/hooks/notify.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/notify.sh";

		mkdirSync(path.dirname(codexHooksPath), { recursive: true });
		writeFileSync(
			codexHooksPath,
			JSON.stringify(
				{
					hooks: {
						UserPromptSubmit: [
							{
								hooks: [
									{ type: "command", command: staleHookPath },
									{
										type: "command",
										command: "/opt/my-custom-prompt-hook.sh",
									},
								],
							},
						],
					},
				},
				null,
				2,
			),
		);

		const content = getCodexGlobalHooksJsonContent(currentHookPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					matcher?: string;
					hooks: Array<{ type: string; command: string }>;
				}>
			>;
		};

		const expectedManagedCommand = `SUPERSET_AGENT_ID=codex "${currentHookPath}"`;
		expect(parsed.hooks.UserPromptSubmit).toBeDefined();
		expect(
			parsed.hooks.UserPromptSubmit?.some((def) =>
				def.hooks.some(
					(hook) => hook.command === "/opt/my-custom-prompt-hook.sh",
				),
			),
		).toBe(true);
		expect(
			parsed.hooks.UserPromptSubmit?.some((def) =>
				def.hooks.some((hook) => hook.command.includes(staleHookPath)),
			),
		).toBe(false);
		expect(
			parsed.hooks.UserPromptSubmit?.some((def) =>
				def.hooks.some((hook) => hook.command === expectedManagedCommand),
			),
		).toBe(true);
	});

	it("reaps stale notify.sh paths from in-repo dev worktrees", () => {
		const codexHooksPath = path.join(mockedHomeDir, ".codex", "hooks.json");
		// Real-world layout: a dev worktree lives under <repo>/.worktrees/<name>
		// and its dev setup writes SUPERSET_HOME_DIR=<worktree>/superset-dev-data.
		// There is no /.superset/ segment anywhere in the path.
		const staleHookPath =
			"/Users/test/code/superset/.worktrees/old-branch/superset-dev-data/hooks/notify.sh";
		const currentHookPath = "/tmp/.superset-new/hooks/notify.sh";

		mkdirSync(path.dirname(codexHooksPath), { recursive: true });
		writeFileSync(
			codexHooksPath,
			JSON.stringify(
				{
					hooks: {
						SessionStart: [
							{ hooks: [{ type: "command", command: staleHookPath }] },
						],
						UserPromptSubmit: [
							{ hooks: [{ type: "command", command: staleHookPath }] },
						],
						Stop: [{ hooks: [{ type: "command", command: staleHookPath }] }],
					},
				},
				null,
				2,
			),
		);

		const content = getCodexGlobalHooksJsonContent(currentHookPath);
		expect(content).not.toBeNull();
		if (content === null) throw new Error("Expected content");

		const parsed = JSON.parse(content) as {
			hooks: Record<
				string,
				Array<{
					matcher?: string;
					hooks: Array<{ type: string; command: string }>;
				}>
			>;
		};

		const expectedManagedCommand = `SUPERSET_AGENT_ID=codex "${currentHookPath}"`;
		for (const eventName of [
			"SessionStart",
			"UserPromptSubmit",
			"Stop",
		] as const) {
			const hooks = parsed.hooks[eventName];
			expect(Array.isArray(hooks)).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command === expectedManagedCommand),
				),
			).toBe(true);
			expect(
				hooks.some((def) =>
					def.hooks.some((hook) => hook.command === staleHookPath),
				),
			).toBe(false);
		}
	});

	it("skips Codex hooks writes when existing JSON is invalid", () => {
		const codexHooksPath = path.join(mockedHomeDir, ".codex", "hooks.json");
		const invalidJson = "{not-json";

		mkdirSync(path.dirname(codexHooksPath), { recursive: true });
		writeFileSync(codexHooksPath, invalidJson);

		expect(
			getCodexGlobalHooksJsonContent("/tmp/.superset/hooks/notify.sh"),
		).toBeNull();

		createCodexHooksJson();

		expect(readFileSync(codexHooksPath, "utf-8")).toBe(invalidJson);
	});

	it("skips Codex hooks writes when existing JSON is not an object", () => {
		const codexHooksPath = path.join(mockedHomeDir, ".codex", "hooks.json");

		mkdirSync(path.dirname(codexHooksPath), { recursive: true });
		writeFileSync(codexHooksPath, JSON.stringify("not-an-object"));

		expect(
			getCodexGlobalHooksJsonContent("/tmp/.superset/hooks/notify.sh"),
		).toBeNull();
	});
});

describe("agent-wrappers pi", () => {
	beforeEach(() => {
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("renders pi extension content with the marker substituted", () => {
		const content = getPiExtensionContent();
		expect(content).toContain(PI_EXTENSION_MARKER);
		expect(content).not.toContain("{{MARKER}}");
	});

	it("renders pi extension content as a valid extension default-export shape", () => {
		const content = getPiExtensionContent();
		expect(content).toContain("export default function");
	});

	it("installs the pi extension into the global ~/.pi/agent/extensions directory", () => {
		const extensionPath = getPiExtensionPath();
		expect(extensionPath).toBe(
			path.join(
				mockedHomeDir,
				".pi",
				"agent",
				"extensions",
				"superset-hooks.ts",
			),
		);

		createPiExtension();

		const installed = readFileSync(extensionPath, "utf-8");
		expect(installed).toContain(PI_EXTENSION_MARKER);
		expect(installed).toContain("export default function");
	});
});
