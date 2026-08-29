import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
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
import { pathToFileURL } from "node:url";

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

mock.module("./notify-hook", () => ({
	NOTIFY_SCRIPT_NAME: "notify.sh",
	NOTIFY_SCRIPT_MARKER: "# Superset agent notification hook v9",
	getNotifyScriptPath: () => path.join(TEST_HOOKS_DIR, "notify.sh"),
	getNotifyScriptContent: () => "#!/bin/bash\nexit 0\n",
	createNotifyScript: () => {},
}));

mock.module("./paths", () => ({
	resolveSupersetHomeDir: () => path.join(TEST_ROOT, "superset"),
	getBinDir: () => TEST_BIN_DIR,
	getHooksDir: () => TEST_HOOKS_DIR,
	getZshDir: () => TEST_ZSH_DIR,
	getBashDir: () => TEST_BASH_DIR,
	getOpenCodeConfigDir: () => TEST_OPENCODE_CONFIG_DIR,
	getOpenCodePluginDir: () => TEST_OPENCODE_PLUGIN_DIR,
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
	COPILOT_HOOK_MARKER,
	CURSOR_HOOK_MARKER,
	createDroidSettingsJson,
	createDroidWrapper,
	createMastraWrapper,
	createOmpExtension,
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
	getOpenCodePluginContent,
	getOmpExtensionContent,
	getOmpExtensionPath,
	OMP_EXTENSION_MARKER,
	removeOmpExtension,
	getPiExtensionContent,
	getPiExtensionPath,
	PI_EXTENSION_MARKER,
} = await import("./agent-wrappers");
const { getManagedNotifyHookCommand } = await import("./agent-wrappers-common");

function requireContent(content: string | null): string {
	if (content === null) throw new Error("Expected merged hook content");
	return content;
}

const managedClaudeHookCommand = getClaudeManagedHookCommand();
const managedDroidHookCommand = getManagedNotifyHookCommand("droid");
const managedCodexHookCommand = getManagedNotifyHookCommand("codex");
const managedMastraHookCommand = getManagedNotifyHookCommand("mastracode");

describe("agent-wrappers opencode", () => {
	const originalTerminalId = process.env.SUPERSET_TERMINAL_ID;
	let pluginImportCounter = 0;

	const loadOpenCodePlugin = async () => {
		mkdirSync(TEST_ROOT, { recursive: true });
		const pluginPath = path.join(
			TEST_ROOT,
			`opencode-notify-${pluginImportCounter++}.mjs`,
		);
		writeFileSync(pluginPath, getOpenCodePluginContent("/tmp/notify.sh"));
		return import(pathToFileURL(pluginPath).href);
	};

	beforeEach(() => {
		delete (
			globalThis as typeof globalThis & {
				__supersetOpencodeNotifyPluginV9?: boolean;
			}
		).__supersetOpencodeNotifyPluginV9;
	});

	afterEach(() => {
		if (originalTerminalId === undefined) {
			delete process.env.SUPERSET_TERMINAL_ID;
		} else {
			process.env.SUPERSET_TERMINAL_ID = originalTerminalId;
		}
	});

	it.each([
		"permission.asked",
		"question.asked",
	])("notifies for the current %s event", async (eventType) => {
		process.env.SUPERSET_TERMINAL_ID = "terminal-1";
		const { SupersetNotifyPlugin } = await loadOpenCodePlugin();
		const notifications: string[] = [];
		const hooks = await SupersetNotifyPlugin({
			$: (
				_parts: TemplateStringsArray,
				_notifyPath: string,
				payload: string,
			) => {
				notifications.push(JSON.parse(payload).hook_event_name);
			},
			client: {
				session: {
					list: async () => ({
						data: [{ id: "root-session" }],
					}),
				},
			},
		});

		await hooks.event({
			event: {
				type: eventType,
				properties: { sessionID: "root-session" },
			},
		});

		expect(notifications).toEqual(["PermissionRequest"]);
	});

	it("retains the legacy permission.ask notification hook", async () => {
		process.env.SUPERSET_TERMINAL_ID = "terminal-1";
		const { SupersetNotifyPlugin } = await loadOpenCodePlugin();
		const notifications: string[] = [];
		const hooks = await SupersetNotifyPlugin({
			$: (
				_parts: TemplateStringsArray,
				_notifyPath: string,
				payload: string,
			) => {
				notifications.push(JSON.parse(payload).hook_event_name);
			},
		});

		await hooks["permission.ask"]({}, { status: "ask" });

		expect(notifications).toEqual(["PermissionRequest"]);
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
			`"$REAL_BIN" "\${_superset_codex_args[@]}" --enable hooks \${_superset_bypass_hook_trust:+"$_superset_bypass_hook_trust"} "$@"`,
		);
		expect(wrapper).not.toContain("-c 'notify=");
		expect(wrapper).toContain('export SUPERSET_AGENT_ID="codex"');

		expect(wrapper).toContain("# Superset agent-wrapper v3");

		// Native hooks remain enabled, but the process-scoped TUI session log is
		// the reliable Start signal for installed Codex TUI builds.
		expect(wrapper).toContain("SUPERSET_CODEX_SESSION_WATCHER_PID");
		expect(wrapper).toContain("CODEX_TUI_RECORD_SESSION");
		expect(wrapper).toContain("CODEX_TUI_SESSION_LOG_PATH");
		expect(wrapper).toContain("SUPERSET_TERMINAL_ID$SUPERSET_TAB_ID");
		expect(wrapper).toContain("_superset_configure_project_trust");
		expect(wrapper).toContain("SUPERSET_WORKSPACE_PATH/.codex");
		expect(wrapper).toContain(
			'projects={\\"$_superset_workspace_path_toml\\"={trust_level=\\"trusted\\"}}',
		);
		// The Usage-tab default resolver may export CODEX_HOME dynamically from
		// the pointer file, but the wrapper must never hardcode a home.
		expect(wrapper).toContain("state/default-codex-home");
		expect(wrapper).toContain('export CODEX_HOME="$superset_default_account"');
		expect(wrapper).not.toContain('export CODEX_HOME="$HOME');
		expect(wrapper).not.toContain("rollout-*.jsonl");
		expect(wrapper).not.toContain("_superset_sessions_dir");
		expect(wrapper).not.toContain("$" + "{CODEX_HOME:-$HOME/.codex}");
		expect(wrapper).toContain("SUPERSET_HOOK_DEBUG_LOG");
		expect(wrapper).toContain("tail -n +1 -F");
		expect(wrapper).toContain("_superset_cleanup_session_watcher");
		expect(wrapper).toContain("_superset_child_pids_for");
		expect(wrapper).toContain('kill -TERM "$_superset_child_pid"');
		expect(wrapper).toContain('kill -KILL "$_superset_watcher_pid"');
		expect(wrapper).not.toContain("mkfifo");
		expect(wrapper).not.toContain(
			"SUPERSET_CODEX_SESSION_WATCHER_TAIL_PID_PATH",
		);
		expect(wrapper).toContain('"UserTurn"');
		expect(wrapper).toContain("_approval_request");

		const execLine = buildCodexWrapperExecLine(
			path.join(TEST_HOOKS_DIR, "notify.sh"),
		);
		expect(execLine).not.toContain("{{NOTIFY_PATH}}");
		expect(wrapper).toContain(execLine);
	});

	it("trusts the Superset workspace codex project config without replacing CODEX_HOME", () => {
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCodex = path.join(realBinDir, "codex");
		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const workspacePath = path.join(TEST_ROOT, "workspace");
		const workspaceCodexHome = path.join(workspacePath, ".codex");
		const explicitCodexHome = path.join(TEST_ROOT, "custom-codex-home");
		const codexHomeFile = path.join(TEST_ROOT, "codex-home.txt");
		const argsFile = path.join(TEST_ROOT, "codex-trust-args.txt");

		mkdirSync(realBinDir, { recursive: true });
		mkdirSync(workspaceCodexHome, { recursive: true });
		writeFileSync(path.join(workspaceCodexHome, "config.toml"), "\n");
		writeFileSync(
			realCodex,
			`#!/bin/bash
printf '%s\n' "\${CODEX_HOME:-}" > "${codexHomeFile}"
printf '%s\n' "$@" > "${argsFile}"
exit 0
`,
			{ mode: 0o755 },
		);
		chmodSync(realCodex, 0o755);

		createCodexWrapper();

		execFileSync(wrapperPath, [], {
			env: {
				...process.env,
				CODEX_HOME: explicitCodexHome,
				PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
				SUPERSET_WORKSPACE_PATH: workspacePath,
			},
			encoding: "utf-8",
		});

		expect(readFileSync(codexHomeFile, "utf-8")).toBe(`${explicitCodexHome}\n`);
		expect(readFileSync(argsFile, "utf-8")).toBe(
			`${[
				"-c",
				`projects={"${workspacePath}"={trust_level="trusted"}}`,
				"--enable",
				"hooks",
				"--dangerously-bypass-hook-trust",
			].join("\n")}\n`,
		);
	});

	it("enables native hooks without overriding the user's codex notify config", () => {
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
				SUPERSET_WORKSPACE_PATH: "",
				SUPERSET_TERMINAL_ID: "terminal-1",
			},
			encoding: "utf-8",
		});

		expect(readFileSync(argsFile, "utf-8")).toBe(
			`${[
				"--enable",
				"hooks",
				"--dangerously-bypass-hook-trust",
				"exec",
				"Reply with exactly OK.",
			].join("\n")}\n`,
		);
	});

	it("does not duplicate the hook-trust bypass when the launch command already passes it", () => {
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCodex = path.join(realBinDir, "codex");
		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const argsFile = path.join(TEST_ROOT, "codex-bypass-args.txt");

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

		// The builtin preset command already carries the flag; codex errors on a
		// repeated boolean flag, so the wrapper must not append a second one.
		execFileSync(
			wrapperPath,
			[
				"--dangerously-bypass-approvals-and-sandbox",
				"--dangerously-bypass-hook-trust",
			],
			{
				env: {
					...process.env,
					PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
					SUPERSET_WORKSPACE_PATH: "",
					SUPERSET_TERMINAL_ID: "terminal-1",
				},
				encoding: "utf-8",
			},
		);

		expect(readFileSync(argsFile, "utf-8")).toBe(
			`${[
				"--enable",
				"hooks",
				"--dangerously-bypass-approvals-and-sandbox",
				"--dangerously-bypass-hook-trust",
			].join("\n")}\n`,
		);

		// A prompt that merely mentions the flag after `--` is text, not a flag —
		// the real bypass must still be appended.
		execFileSync(
			wrapperPath,
			["--", "explain what --dangerously-bypass-hook-trust does"],
			{
				env: {
					...process.env,
					PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
					SUPERSET_WORKSPACE_PATH: "",
					SUPERSET_TERMINAL_ID: "terminal-1",
				},
				encoding: "utf-8",
			},
		);

		expect(readFileSync(argsFile, "utf-8")).toBe(
			`${[
				"--enable",
				"hooks",
				"--dangerously-bypass-hook-trust",
				"--",
				"explain what --dangerously-bypass-hook-trust does",
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

		// Only the clean-exit SessionEnd report — nothing from the unrelated
		// rollout file.
		const notifications = readFileSync(notifyCapturePath, "utf-8");
		expect(notifications.trim()).toBe('{"hook_event_name":"SessionEnd"}');
		expect(readFileSync(debugLogPath, "utf-8")).toContain("watching session=");
	});

	it("reports SessionEnd on clean codex exit but not on signal death", () => {
		const realBinDir = path.join(TEST_ROOT, "real-bin");
		const realCodex = path.join(realBinDir, "codex");
		const wrapperPath = path.join(TEST_BIN_DIR, "codex");
		const notifyPath = path.join(TEST_HOOKS_DIR, "notify.sh");
		const notifyCapturePath = path.join(
			TEST_ROOT,
			"codex-session-end-events.txt",
		);

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
		createCodexWrapper();

		const runWrapper = () =>
			spawnSync(wrapperPath, [], {
				env: {
					...process.env,
					NOTIFY_CAPTURE_PATH: notifyCapturePath,
					PATH: `${TEST_BIN_DIR}:${realBinDir}:${process.env.PATH || ""}`,
					SUPERSET_TERMINAL_ID: "terminal-1",
				},
				encoding: "utf-8",
			});

		writeFileSync(realCodex, "#!/bin/bash\nexit 0\n", { mode: 0o755 });
		chmodSync(realCodex, 0o755);
		runWrapper();
		expect(readFileSync(notifyCapturePath, "utf-8").trim()).toBe(
			'{"hook_event_name":"SessionEnd"}',
		);

		// A signal death (pty/daemon kill) must stay unreported so the session
		// remains a resume candidate.
		rmSync(notifyCapturePath);
		writeFileSync(realCodex, '#!/bin/bash\nkill -HUP "$$"\nsleep 1\n', {
			mode: 0o755,
		});
		chmodSync(realCodex, 0o755);
		const signalRun = runWrapper();
		expect(signalRun.status).toBe(129);
		expect(existsSync(notifyCapturePath)).toBe(false);
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

		const content = requireContent(getCursorHooksJsonContent(currentHookPath));
		writeFileSync(cursorHooksPath, content);
		const content2 = requireContent(getCursorHooksJsonContent(currentHookPath));

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

		const content = requireContent(
			getGeminiSettingsJsonContent(currentHookPath),
		);
		writeFileSync(geminiSettingsPath, content);
		const content2 = requireContent(
			getGeminiSettingsJsonContent(currentHookPath),
		);

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

	it("bumps hook script markers when hook semantics change", () => {
		expect(COPILOT_HOOK_MARKER).toBe("# Superset copilot hook v5");
		expect(CURSOR_HOOK_MARKER).toBe("# Superset cursor hook v7");
		expect(GEMINI_HOOK_MARKER).toBe("# Superset gemini hook v6");
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

		const content = requireContent(getMastraHooksJsonContent(currentHookPath));
		writeFileSync(mastraHooksPath, content);
		const content2 = requireContent(getMastraHooksJsonContent(currentHookPath));

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
						entry.command === managedMastraHookCommand,
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
					def.hooks.some((hook) => hook.command === managedDroidHookCommand),
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

		const expectedCommand = managedCodexHookCommand;
		for (const eventName of [
			"SessionStart",
			"SessionEnd",
			"UserPromptSubmit",
			"Stop",
			"Interrupt",
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

		const expectedManagedCommand = managedCodexHookCommand;
		// Adds managed hooks for session, prompt, completion, and interruption lifecycle events.
		for (const eventName of [
			"SessionStart",
			"SessionEnd",
			"UserPromptSubmit",
			"Stop",
			"Interrupt",
		]) {
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

		const expectedManagedCommand = managedCodexHookCommand;
		for (const eventName of [
			"SessionStart",
			"SessionEnd",
			"UserPromptSubmit",
			"Stop",
			"Interrupt",
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

		const expectedManagedCommand = managedCodexHookCommand;
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

		const expectedManagedCommand = managedCodexHookCommand;
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

import {
	getVibeHooksTomlContent,
	getVibeWrapperScript,
	VIBE_HOOKS_MARKER_END,
	VIBE_HOOKS_MARKER_START,
} from "./agent-wrappers-vibe";

describe("vibe wrapper", () => {
	it("enables experimental hooks and stamps the agent id", () => {
		const script = getVibeWrapperScript();
		expect(script).toContain('export SUPERSET_AGENT_ID="vibe"');
		expect(script).toContain("export VIBE_ENABLE_EXPERIMENTAL_HOOKS=true");
		expect(script).toContain('exec "$REAL_BIN" "$@"');
	});
});

describe("vibe hooks.toml", () => {
	it("writes both managed hooks inside markers on an empty file", () => {
		const out = getVibeHooksTomlContent("");
		expect(out).toContain(VIBE_HOOKS_MARKER_START);
		expect(out).toContain(VIBE_HOOKS_MARKER_END);
		expect(out).toContain('type = "before_tool"');
		expect(out).toContain('type = "post_agent_turn"');
		expect(out).toContain("SUPERSET_AGENT_ID=vibe");
	});
	it("preserves user hooks and is idempotent", () => {
		const user =
			'[[hooks]]\nname = "mine"\ntype = "after_tool"\ncommand = "echo hi"\n';
		const once = getVibeHooksTomlContent(user);
		expect(once).toContain('name = "mine"');
		// Re-running does not duplicate the managed block.
		const twice = getVibeHooksTomlContent(once);
		// Count by splitting: the marker contains regex metachars ("(do not edit)"),
		// so `new RegExp(marker)` would not match the literal text.
		expect(twice.split(VIBE_HOOKS_MARKER_START).length - 1).toBe(1);
		expect(twice).toContain('name = "mine"');
	});
	it("cleans up an orphaned start marker left by a partial write", () => {
		// Simulate a prior interrupted write: a user hook, then a start marker and
		// a half-written managed block with NO end marker.
		const partial = [
			"[[hooks]]",
			'name = "mine"',
			'type = "after_tool"',
			'command = "echo hi"',
			"",
			VIBE_HOOKS_MARKER_START,
			"[[hooks]]",
			'name = "superset-notify-before-tool"',
			'type = "before_tool"',
			"",
		].join("\n");
		const out = getVibeHooksTomlContent(partial);
		// User hook survives, and exactly one complete managed block is emitted —
		// no duplicate hook entries and no dangling marker.
		expect(out).toContain('name = "mine"');
		expect(out.split(VIBE_HOOKS_MARKER_START).length - 1).toBe(1);
		expect(out.split(VIBE_HOOKS_MARKER_END).length - 1).toBe(1);
		expect(out.split('type = "before_tool"').length - 1).toBe(1);
		expect(out.split('type = "post_agent_turn"').length - 1).toBe(1);
	});
	it("preserves user hooks that follow an orphaned start marker", () => {
		// End marker lost to a hand-edit/crash, with a user hook AFTER our block.
		const partial = [
			VIBE_HOOKS_MARKER_START,
			"[[hooks]]",
			'name = "superset-notify-before-tool"',
			'type = "before_tool"',
			"command = 'true'",
			// NO end marker
			"",
			"# my own hook",
			"[[hooks]]",
			'name = "my-lint-on-save"',
			'type = "before_tool"',
			'command = "run-my-linter.sh"',
		].join("\n");
		const out = getVibeHooksTomlContent(partial);
		expect(out).toContain('name = "my-lint-on-save"');
		expect(out).toContain("# my own hook");
		// Exactly one complete managed block, no dangling/duplicate markers.
		expect(out.split(VIBE_HOOKS_MARKER_START).length - 1).toBe(1);
		expect(out.split(VIBE_HOOKS_MARKER_END).length - 1).toBe(1);
		expect(out.split('name = "superset-notify-before-tool"').length - 1).toBe(
			1,
		);
	});
});

import {
	getKimiConfigTomlContent,
	getKimiWrapperScript,
	KIMI_HOOKS_MARKER_END,
	KIMI_HOOKS_MARKER_START,
} from "./agent-wrappers-kimi";

describe("kimi wrapper", () => {
	it("stamps the agent id and forwards arguments to the real binary", () => {
		const script = getKimiWrapperScript();
		expect(script).toContain('export SUPERSET_AGENT_ID="kimi"');
		expect(script).toContain('exec "$REAL_BIN" "$@"');
	});
});

describe("kimi config.toml", () => {
	it("registers the lifecycle hooks Kimi exposes", () => {
		const out = getKimiConfigTomlContent("");
		expect(out).toContain(KIMI_HOOKS_MARKER_START);
		expect(out).toContain(KIMI_HOOKS_MARKER_END);
		for (const event of [
			"SessionStart",
			"UserPromptSubmit",
			"PostToolUse",
			"PostToolUseFailure",
			"PermissionRequest",
			"PermissionResult",
			"StopFailure",
			"Interrupt",
			"Stop",
			"SessionEnd",
		]) {
			expect(out).toContain(`event = "${event}"`);
		}
		expect(out).toContain("SUPERSET_AGENT_ID=kimi");
	});

	it("preserves user config and replaces the managed block idempotently", () => {
		const user = [
			'default_model = "my-model"',
			"",
			"[[hooks]]",
			'event = "Notification"',
			'command = "show-my-notification"',
			"",
		].join("\n");
		const once = getKimiConfigTomlContent(user);
		const twice = getKimiConfigTomlContent(once);

		expect(twice).toContain('default_model = "my-model"');
		expect(twice).toContain('command = "show-my-notification"');
		expect(twice.split(KIMI_HOOKS_MARKER_START).length - 1).toBe(1);
		expect(twice.split(KIMI_HOOKS_MARKER_END).length - 1).toBe(1);
	});

	it("preserves user hooks after an orphaned managed block", () => {
		const partial = [
			KIMI_HOOKS_MARKER_START,
			"[[hooks]]",
			'event = "SessionStart"',
			"command = 'SUPERSET_AGENT_ID=kimi true'",
			"",
			"# user hook",
			"[[hooks]]",
			'event = "Notification"',
			'command = "show-my-notification"',
		].join("\n");
		const out = getKimiConfigTomlContent(partial);

		expect(out).toContain("# user hook");
		expect(out).toContain('command = "show-my-notification"');
		expect(out.split(KIMI_HOOKS_MARKER_START).length - 1).toBe(1);
		expect(out.split(KIMI_HOOKS_MARKER_END).length - 1).toBe(1);
	});
});

import {
	GROK_BLOCKING_NOTIFICATION_TYPES,
	GROK_COMPAT_MARKER_END,
	GROK_COMPAT_MARKER_START,
	getGrokConfigTomlContent,
	getGrokHooksJsonContent,
	getGrokWrapperScript,
} from "./agent-wrappers-grok";

describe("grok wrapper", () => {
	it("stamps the agent id and forwards arguments to the real binary", () => {
		const script = getGrokWrapperScript();
		expect(script).toContain('export SUPERSET_AGENT_ID="grok"');
		expect(script).toContain('exec "$REAL_BIN" "$@"');
	});
});

describe("grok hooks json", () => {
	it("registers passive lifecycle hooks and skips blocking PreToolUse", () => {
		const parsed = JSON.parse(getGrokHooksJsonContent());
		const events = Object.keys(parsed.hooks);
		expect(events).toEqual([
			"SessionStart",
			"SessionEnd",
			"UserPromptSubmit",
			"PostToolUse",
			"PostToolUseFailure",
			"Stop",
			"StopFailure",
			"Notification",
		]);
		expect(events).not.toContain("PreToolUse");
		for (const definitions of Object.values(parsed.hooks)) {
			const [definition] = definitions as Array<{
				matcher?: string;
				hooks: Array<{ type: string; command: string }>;
			}>;
			expect(definition.hooks[0].type).toBe("command");
			expect(definition.hooks[0].command).toContain("SUPERSET_AGENT_ID=grok");
		}
		expect(parsed.hooks.Notification[0].matcher).toBe(
			`^(${GROK_BLOCKING_NOTIFICATION_TYPES.join("|")})$`,
		);
	});

	it("keeps the notify template's subtype filter in sync with the matcher", () => {
		const template = readFileSync(
			path.join(import.meta.dir, "..", "templates", "notify-hook.template.sh"),
			"utf-8",
		);
		expect(template).toContain(
			`${GROK_BLOCKING_NOTIFICATION_TYPES.join("|")}) EVENT_TYPE="PermissionRequest"`,
		);
	});
});

describe("grok config.toml", () => {
	it("disables Claude/Cursor hook compat inside the managed block", () => {
		const out = getGrokConfigTomlContent("");
		expect(out).toContain(GROK_COMPAT_MARKER_START);
		expect(out).toContain(GROK_COMPAT_MARKER_END);
		expect(out).toContain("[compat.claude]");
		expect(out).toContain("[compat.cursor]");
		expect(out).toContain("hooks = false");
	});

	it("preserves user config and replaces the managed block idempotently", () => {
		const user = ['[models]\ndefault = "grok-4"', ""].join("\n");
		const once = getGrokConfigTomlContent(user);
		const twice = getGrokConfigTomlContent(once);

		expect(twice).toContain('default = "grok-4"');
		expect(twice.split(GROK_COMPAT_MARKER_START).length - 1).toBe(1);
		expect(twice.split(GROK_COMPAT_MARKER_END).length - 1).toBe(1);
	});

	it("skips a compat table the user already defines", () => {
		const user = "[compat.claude]\nhooks = true\n";
		const out = getGrokConfigTomlContent(user);

		expect(out).toContain("hooks = true");
		expect(out.split("[compat.claude]").length - 1).toBe(1);
		expect(out).toContain("[compat.cursor]");
	});

	it("preserves user tables after an orphaned managed block", () => {
		const partial = [
			GROK_COMPAT_MARKER_START,
			"[compat.claude]",
			"hooks = false",
			"",
			"# user table",
			"[models]",
			'default = "grok-4"',
		].join("\n");
		const out = getGrokConfigTomlContent(partial);

		expect(out).toContain("# user table");
		expect(out).toContain('default = "grok-4"');
		expect(out.split(GROK_COMPAT_MARKER_START).length - 1).toBe(1);
		expect(out.split(GROK_COMPAT_MARKER_END).length - 1).toBe(1);
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

const {
	getKimiConfigTomlPath,
	removeCursorManagedHooks,
	removeDroidManagedHooks,
	removeKimiManagedHooks,
	removeMastraManagedHooks,
} = await import("./agent-wrappers");

describe("managed hooks teardown", () => {
	beforeEach(() => {
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("removes managed droid hooks, preserving user hooks and settings", () => {
		const settingsPath = path.join(mockedHomeDir, ".factory", "settings.json");
		mkdirSync(path.dirname(settingsPath), { recursive: true });
		writeFileSync(
			settingsPath,
			JSON.stringify(
				{
					model: "custom",
					hooks: {
						Stop: [
							{ hooks: [{ type: "command", command: "/opt/user-hook.sh" }] },
							{
								hooks: [{ type: "command", command: managedDroidHookCommand }],
							},
							{
								hooks: [
									{
										type: "command",
										command:
											"SUPERSET_AGENT_ID=droid '/tmp/.superset/hooks/notify.sh'",
									},
								],
							},
						],
						SessionStart: [
							{
								hooks: [{ type: "command", command: managedDroidHookCommand }],
							},
						],
					},
				},
				null,
				2,
			),
		);

		removeDroidManagedHooks();

		const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(parsed.model).toBe("custom");
		expect(parsed.hooks.Stop).toEqual([
			{ hooks: [{ type: "command", command: "/opt/user-hook.sh" }] },
		]);
		// Managed-only events are dropped entirely.
		expect(parsed.hooks.SessionStart).toBeUndefined();

		// Second run is a no-op on already-clean config.
		const cleaned = readFileSync(settingsPath, "utf-8");
		removeDroidManagedHooks();
		expect(readFileSync(settingsPath, "utf-8")).toBe(cleaned);
	});

	it("drops the droid hooks key when every event was managed and never creates a missing file", () => {
		const settingsPath = path.join(mockedHomeDir, ".factory", "settings.json");

		removeDroidManagedHooks();
		expect(existsSync(settingsPath)).toBe(false);

		mkdirSync(path.dirname(settingsPath), { recursive: true });
		writeFileSync(
			settingsPath,
			JSON.stringify({
				hooks: {
					Stop: [
						{ hooks: [{ type: "command", command: managedDroidHookCommand }] },
					],
				},
			}),
		);

		removeDroidManagedHooks();

		expect(JSON.parse(readFileSync(settingsPath, "utf-8"))).toEqual({});
	});

	it("leaves a droid settings file untouched when its JSON is invalid", () => {
		const settingsPath = path.join(mockedHomeDir, ".factory", "settings.json");
		mkdirSync(path.dirname(settingsPath), { recursive: true });
		writeFileSync(settingsPath, "{not-json");

		removeDroidManagedHooks();

		expect(readFileSync(settingsPath, "utf-8")).toBe("{not-json");
	});

	it("removes managed cursor hooks but keeps the hooks container and version", () => {
		const hooksPath = path.join(mockedHomeDir, ".cursor", "hooks.json");
		mkdirSync(path.dirname(hooksPath), { recursive: true });
		const scriptPath = path.join(TEST_HOOKS_DIR, "cursor-hook.sh");
		writeFileSync(
			hooksPath,
			JSON.stringify({
				version: 1,
				hooks: {
					stop: [
						{ command: "/opt/user-cursor-hook.sh" },
						{ command: `${scriptPath} Stop` },
					],
					sessionStart: [{ command: `${scriptPath} SessionStart` }],
				},
			}),
		);

		removeCursorManagedHooks();

		const parsed = JSON.parse(readFileSync(hooksPath, "utf-8"));
		expect(parsed.version).toBe(1);
		expect(parsed.hooks.stop).toEqual([
			{ command: "/opt/user-cursor-hook.sh" },
		]);
		expect(parsed.hooks.sessionStart).toBeUndefined();
		expect(parsed.hooks).toBeDefined();
	});

	it("removes managed mastra hooks from the root-level event map", () => {
		const hooksPath = path.join(mockedHomeDir, ".mastracode", "hooks.json");
		mkdirSync(path.dirname(hooksPath), { recursive: true });
		writeFileSync(
			hooksPath,
			JSON.stringify({
				Stop: [
					{ type: "command", command: "/opt/user-mastra-hook.sh" },
					{ type: "command", command: managedMastraHookCommand },
				],
				SessionStart: [{ type: "command", command: managedMastraHookCommand }],
			}),
		);

		removeMastraManagedHooks();

		const parsed = JSON.parse(readFileSync(hooksPath, "utf-8"));
		expect(parsed.Stop).toEqual([
			{ type: "command", command: "/opt/user-mastra-hook.sh" },
		]);
		expect(parsed.SessionStart).toBeUndefined();
	});

	it("skips mastra merge instead of clobbering an unparseable file", () => {
		const hooksPath = path.join(mockedHomeDir, ".mastracode", "hooks.json");
		mkdirSync(path.dirname(hooksPath), { recursive: true });
		writeFileSync(hooksPath, "{not-json");

		expect(getMastraHooksJsonContent("/tmp/.superset/hooks/notify.sh")).toBe(
			null,
		);
	});

	it("removes the kimi managed block, deleting the file only when nothing else remains", () => {
		const configPath = getKimiConfigTomlPath();
		mkdirSync(path.dirname(configPath), { recursive: true });

		const userConfig = '[user]\nkey = "value"';
		writeFileSync(
			configPath,
			`${userConfig}\n\n${KIMI_HOOKS_MARKER_START}\n[[hooks]]\nevent = "Stop"\ncommand = 'SUPERSET_AGENT_ID=kimi x'\n${KIMI_HOOKS_MARKER_END}\n`,
		);
		removeKimiManagedHooks();
		expect(readFileSync(configPath, "utf-8")).toBe(`${userConfig}\n`);

		writeFileSync(
			configPath,
			`${KIMI_HOOKS_MARKER_START}\n[[hooks]]\nevent = "Stop"\ncommand = 'SUPERSET_AGENT_ID=kimi x'\n${KIMI_HOOKS_MARKER_END}\n`,
		);
		removeKimiManagedHooks();
		expect(existsSync(configPath)).toBe(false);
	});
});

describe("managed hooks junk tolerance", () => {
	beforeEach(() => {
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("preserves null and primitive entries instead of aborting the merge", () => {
		const settingsPath = path.join(mockedHomeDir, ".factory", "settings.json");
		mkdirSync(path.dirname(settingsPath), { recursive: true });
		writeFileSync(
			settingsPath,
			JSON.stringify({
				hooks: {
					Stop: [
						null,
						"junk-string",
						{ hooks: [{ type: "command", command: "/opt/user-hook.sh" }] },
					],
				},
			}),
		);

		const content = getDroidSettingsJsonContent(
			"/tmp/.superset/hooks/notify.sh",
		);
		expect(content).not.toBeNull();
		const parsed = JSON.parse(content as string);
		expect(parsed.hooks.Stop[0]).toBe(null);
		expect(parsed.hooks.Stop[1]).toBe("junk-string");
		expect(
			parsed.hooks.Stop.some(
				(d: { hooks?: Array<{ command: string }> }) =>
					Array.isArray(d?.hooks) &&
					d.hooks.some((h) => h.command === managedDroidHookCommand),
			),
		).toBe(true);

		removeDroidManagedHooks();
		const afterRemove = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(afterRemove.hooks.Stop).toEqual([
			null,
			"junk-string",
			{ hooks: [{ type: "command", command: "/opt/user-hook.sh" }] },
		]);
	});
});

describe("agent-wrappers omp", () => {
	let originalOmpCodingAgentDir: string | undefined;
	let originalPiCodingAgentDir: string | undefined;

	beforeEach(() => {
		originalOmpCodingAgentDir = process.env.OMP_CODING_AGENT_DIR;
		originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
		mockedHomeDir = path.join(TEST_ROOT, "home");
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
		delete process.env.OMP_CODING_AGENT_DIR;
		delete process.env.PI_CODING_AGENT_DIR;
	});

	afterEach(() => {
		if (originalOmpCodingAgentDir === undefined) {
			delete process.env.OMP_CODING_AGENT_DIR;
		} else {
			process.env.OMP_CODING_AGENT_DIR = originalOmpCodingAgentDir;
		}
		if (originalPiCodingAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
		}
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("renders Oh My Pi extension content with the marker substituted", () => {
		const content = getOmpExtensionContent();
		expect(content).toContain(OMP_EXTENSION_MARKER);
		expect(content).not.toContain("{{MARKER}}");
	});

	it("renders Oh My Pi extension content as a valid extension default-export shape", () => {
		const content = getOmpExtensionContent();
		expect(content).toContain("export default function");
	});

	it("maps OMP lifecycle events to Superset lifecycle hooks", () => {
		const content = getOmpExtensionContent();
		expect(content).toContain('["session_start", "SessionStart"]');
		expect(content).toContain('["agent_start", "UserPromptSubmit"]');
		expect(content).toContain('["before_agent_start", "UserPromptSubmit"]');
		expect(content).toContain('["tool_execution_end", "PostToolUse"]');
		expect(content).toContain('["agent_end", "Stop"]');
		expect(content).toContain('["session_end", "SessionEnd"]');
		expect(content).toContain('["session_shutdown", "Stop"]');
		expect(content).toContain(
			"for (const [eventName, hookEventName] of lifecycleMappings)",
		);
		expect(content).toContain("pi.on(eventName");
		expect(content).toContain("fire(hookEventName)");
		expect(content).toContain('SUPERSET_AGENT_ID: "omp"');
	});

	it("installs the Oh My Pi extension into the global ~/.omp/agent/extensions directory", () => {
		const extensionPath = getOmpExtensionPath();
		expect(extensionPath).toBe(
			path.join(
				mockedHomeDir,
				".omp",
				"agent",
				"extensions",
				"superset-hooks.ts",
			),
		);

		createOmpExtension();

		const installed = readFileSync(extensionPath, "utf-8");
		expect(installed).toContain(OMP_EXTENSION_MARKER);
		expect(installed).toContain("export default function");
	});

	it("honors OMP_CODING_AGENT_DIR when locating the Oh My Pi extension", () => {
		const customAgentDir = path.join(mockedHomeDir, "custom-omp-agent");
		process.env.OMP_CODING_AGENT_DIR = customAgentDir;

		expect(getOmpExtensionPath()).toBe(
			path.join(customAgentDir, "extensions", "superset-hooks.ts"),
		);
	});

	it("expands leading tildes in OMP_CODING_AGENT_DIR", () => {
		process.env.OMP_CODING_AGENT_DIR = "~/custom-omp-agent";
		expect(getOmpExtensionPath()).toBe(
			path.join(
				mockedHomeDir,
				"custom-omp-agent",
				"extensions",
				"superset-hooks.ts",
			),
		);

		process.env.OMP_CODING_AGENT_DIR = "~\\custom-omp-agent";
		expect(getOmpExtensionPath()).toBe(
			path.join(
				`${mockedHomeDir}\\custom-omp-agent`,
				"extensions",
				"superset-hooks.ts",
			),
		);
	});

	it("ignores PI_CODING_AGENT_DIR so pi and omp resolve to distinct extension trees", () => {
		process.env.PI_CODING_AGENT_DIR = path.join(mockedHomeDir, ".pi", "agent");

		expect(getOmpExtensionPath()).toBe(
			path.join(
				mockedHomeDir,
				".omp",
				"agent",
				"extensions",
				"superset-hooks.ts",
			),
		);
		expect(getOmpExtensionPath()).not.toBe(getPiExtensionPath());
	});

	it("removes the Superset-owned Oh My Pi extension on teardown", () => {
		createOmpExtension();
		const extensionPath = getOmpExtensionPath();
		expect(existsSync(extensionPath)).toBe(true);

		removeOmpExtension();
		expect(existsSync(extensionPath)).toBe(false);

		// Second run is a no-op when nothing is installed.
		removeOmpExtension();
		expect(existsSync(extensionPath)).toBe(false);
	});

	it("leaves a user-authored extension file in place on teardown", () => {
		const extensionPath = getOmpExtensionPath();
		mkdirSync(path.dirname(extensionPath), { recursive: true });
		writeFileSync(extensionPath, "export default function userExtension() {}");

		removeOmpExtension();

		expect(readFileSync(extensionPath, "utf-8")).toBe(
			"export default function userExtension() {}",
		);
	});
});
