import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "shared/env.shared";
import { getNotifyScriptPath } from "./notify-hook";
import {
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR,
} from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v1";
export const CLAUDE_SETTINGS_FILE = "claude-settings.json";
export const OPENCODE_PLUGIN_FILE = "superset-notify.js";

const OPENCODE_PLUGIN_SIGNATURE = "// Superset opencode plugin";
const OPENCODE_PLUGIN_VERSION = "v8";
export const OPENCODE_PLUGIN_MARKER = `${OPENCODE_PLUGIN_SIGNATURE} ${OPENCODE_PLUGIN_VERSION}`;

const OPENCODE_PLUGIN_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"opencode-plugin.template.js",
);

function buildRealBinaryResolver(): string {
	return `find_real_binary() {
  local name="$1"
  local IFS=:
  for dir in $PATH; do
    [ -z "$dir" ] && continue
    dir="\${dir%/}"
    case "$dir" in
      "${BIN_DIR}"|"$HOME"/.superset/bin|"$HOME"/.superset-*/bin) continue ;;
    esac
    if [ -x "$dir/$name" ] && [ ! -d "$dir/$name" ]; then
      printf "%s\\n" "$dir/$name"
      return 0
    fi
  done
  return 1
}
`;
}

function getMissingBinaryMessage(name: string): string {
	return `Superset: ${name} not found in PATH. Install it and ensure it is on PATH, then retry.`;
}

export function getWrapperPath(binaryName: string): string {
	return path.join(BIN_DIR, binaryName);
}

export function getClaudeSettingsPath(): string {
	return path.join(HOOKS_DIR, CLAUDE_SETTINGS_FILE);
}

export function getOpenCodePluginPath(): string {
	return path.join(OPENCODE_PLUGIN_DIR, OPENCODE_PLUGIN_FILE);
}

/** @see https://opencode.ai/docs/plugins */
export function getOpenCodeGlobalPluginPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(os.homedir(), ".config");
	return path.join(configHome, "opencode", "plugin", OPENCODE_PLUGIN_FILE);
}

export function getClaudeSettingsContent(notifyPath: string): string {
	const settings = {
		hooks: {
			UserPromptSubmit: [{ hooks: [{ type: "command", command: notifyPath }] }],
			Stop: [{ hooks: [{ type: "command", command: notifyPath }] }],
			PostToolUse: [
				{ matcher: "*", hooks: [{ type: "command", command: notifyPath }] },
			],
			PostToolUseFailure: [
				{ matcher: "*", hooks: [{ type: "command", command: notifyPath }] },
			],
			PermissionRequest: [
				{ matcher: "*", hooks: [{ type: "command", command: notifyPath }] },
			],
		},
	};

	return JSON.stringify(settings);
}

export function buildWrapperScript(
	binaryName: string,
	execLine: string,
): string {
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for ${binaryName}

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "${binaryName}")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage(binaryName)}" >&2
  exit 127
fi

${execLine}
`;
}

export function getOpenCodePluginContent(notifyPath: string): string {
	const template = fs.readFileSync(OPENCODE_PLUGIN_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", OPENCODE_PLUGIN_MARKER)
		.replace("{{NOTIFY_PATH}}", notifyPath);
}

function createClaudeSettings(): string {
	const settingsPath = getClaudeSettingsPath();
	const notifyPath = getNotifyScriptPath();
	const settings = getClaudeSettingsContent(notifyPath);

	fs.writeFileSync(settingsPath, settings, { mode: 0o644 });
	return settingsPath;
}

function createWrapper(binaryName: string, script: string): void {
	fs.writeFileSync(getWrapperPath(binaryName), script, { mode: 0o755 });
	console.log(`[agent-setup] Created ${binaryName} wrapper`);
}

export function createClaudeWrapper(): void {
	const settingsPath = createClaudeSettings();
	const script = buildWrapperScript(
		"claude",
		`exec "$REAL_BIN" --settings "${settingsPath}" "$@"`,
	);
	createWrapper("claude", script);
}

export function createCodexWrapper(): void {
	const notifyPath = getNotifyScriptPath();
	const script = buildWrapperScript(
		"codex",
		`exec "$REAL_BIN" -c 'notify=["bash","${notifyPath}"]' "$@"`,
	);
	createWrapper("codex", script);
}

/**
 * Writes to environment-specific path only, NOT the global path.
 * Global path causes dev/prod conflicts when both are running.
 */
export function createOpenCodePlugin(): void {
	const pluginPath = getOpenCodePluginPath();
	const notifyPath = getNotifyScriptPath();
	const content = getOpenCodePluginContent(notifyPath);
	fs.writeFileSync(pluginPath, content, { mode: 0o644 });
	console.log("[agent-setup] Created OpenCode plugin");
}

/**
 * Removes stale global plugin written by older versions.
 * Only removes if the file contains our signature to avoid deleting user plugins.
 */
export function cleanupGlobalOpenCodePlugin(): void {
	try {
		const globalPluginPath = getOpenCodeGlobalPluginPath();
		if (!fs.existsSync(globalPluginPath)) return;

		const content = fs.readFileSync(globalPluginPath, "utf-8");
		if (content.includes(OPENCODE_PLUGIN_SIGNATURE)) {
			fs.unlinkSync(globalPluginPath);
			console.log(
				"[agent-setup] Removed stale global OpenCode plugin to prevent dev/prod conflicts",
			);
		}
	} catch (error) {
		console.warn(
			"[agent-setup] Failed to cleanup global OpenCode plugin:",
			error,
		);
	}
}

export function createOpenCodeWrapper(): void {
	const script = buildWrapperScript(
		"opencode",
		`export OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR}"\nexec "$REAL_BIN" "$@"`,
	);
	createWrapper("opencode", script);
}

// --- Cursor agent support ---

export const CURSOR_HOOK_SCRIPT_NAME = "cursor-hook.sh";

const CURSOR_HOOK_SIGNATURE = "# Superset cursor hook";
const CURSOR_HOOK_VERSION = "v1";
export const CURSOR_HOOK_MARKER = `${CURSOR_HOOK_SIGNATURE} ${CURSOR_HOOK_VERSION}`;

const CURSOR_HOOK_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"cursor-hook.template.sh",
);

export function getCursorHookScriptPath(): string {
	return path.join(HOOKS_DIR, CURSOR_HOOK_SCRIPT_NAME);
}

export function getCursorGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".cursor", "hooks.json");
}

export function getCursorHookScriptContent(): string {
	const template = fs.readFileSync(CURSOR_HOOK_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", CURSOR_HOOK_MARKER)
		.replace(/\{\{DEFAULT_PORT\}\}/g, String(env.DESKTOP_NOTIFICATIONS_PORT));
}

/**
 * Reads existing ~/.cursor/hooks.json, merges our hook entries (identified by
 * hook script path), and preserves any user-defined hooks.
 */
export function getCursorHooksJsonContent(hookScriptPath: string): string {
	const globalPath = getCursorGlobalHooksJsonPath();

	interface CursorHookEntry {
		command: string;
		[key: string]: unknown;
	}

	interface CursorHooksJson {
		version?: number;
		hooks?: Record<string, CursorHookEntry[]>;
		[key: string]: unknown;
	}

	let existing: CursorHooksJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.cursor/hooks.json, merging carefully",
		);
	}

	// Ensure top-level structure: { version: 1, hooks: { ... } }
	if (!existing.version) {
		existing.version = 1;
	}
	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const ourHooks: Record<string, CursorHookEntry> = {
		beforeSubmitPrompt: { command: `${hookScriptPath} Start` },
		stop: { command: `${hookScriptPath} Stop` },
		beforeShellExecution: {
			command: `${hookScriptPath} PermissionRequest`,
		},
		beforeMCPExecution: {
			command: `${hookScriptPath} PermissionRequest`,
		},
	};

	for (const [eventName, ourEntry] of Object.entries(ourHooks)) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			const filtered = current.filter(
				(entry: CursorHookEntry) => !entry.command?.includes(hookScriptPath),
			);
			filtered.push(ourEntry);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [ourEntry];
		}
	}

	return JSON.stringify(existing, null, 2);
}

export function createCursorHookScript(): void {
	const scriptPath = getCursorHookScriptPath();
	const content = getCursorHookScriptContent();
	fs.writeFileSync(scriptPath, content, { mode: 0o755 });
	console.log("[agent-setup] Created Cursor hook script");
}

export function createCursorAgentWrapper(): void {
	const script = buildWrapperScript("cursor-agent", `exec "$REAL_BIN" "$@"`);
	createWrapper("cursor-agent", script);
}

export function createCursorHooksJson(): void {
	const hookScriptPath = getCursorHookScriptPath();
	const globalPath = getCursorGlobalHooksJsonPath();
	const content = getCursorHooksJsonContent(hookScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(globalPath, content, { mode: 0o644 });
	console.log("[agent-setup] Created Cursor hooks.json");
}

// --- Gemini CLI support ---

export const GEMINI_HOOK_SCRIPT_NAME = "gemini-hook.sh";

const GEMINI_HOOK_SIGNATURE = "# Superset gemini hook";
const GEMINI_HOOK_VERSION = "v1";
export const GEMINI_HOOK_MARKER = `${GEMINI_HOOK_SIGNATURE} ${GEMINI_HOOK_VERSION}`;

const GEMINI_HOOK_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"gemini-hook.template.sh",
);

export function getGeminiHookScriptPath(): string {
	return path.join(HOOKS_DIR, GEMINI_HOOK_SCRIPT_NAME);
}

export function getGeminiSettingsJsonPath(): string {
	return path.join(os.homedir(), ".gemini", "settings.json");
}

export function getGeminiHookScriptContent(): string {
	const template = fs.readFileSync(GEMINI_HOOK_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", GEMINI_HOOK_MARKER)
		.replace(/\{\{DEFAULT_PORT\}\}/g, String(env.DESKTOP_NOTIFICATIONS_PORT));
}

/**
 * Reads existing ~/.gemini/settings.json, merges our hook definitions (identified by
 * hook script path), and preserves any user-defined settings/hooks.
 *
 * Gemini CLI uses a two-level nesting format:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export function getGeminiSettingsJsonContent(hookScriptPath: string): string {
	const globalPath = getGeminiSettingsJsonPath();

	interface GeminiHookConfig {
		type: string;
		command: string;
		[key: string]: unknown;
	}

	interface GeminiHookDefinition {
		matcher?: string;
		hooks?: GeminiHookConfig[];
		[key: string]: unknown;
	}

	interface GeminiSettingsJson {
		hooks?: Record<string, GeminiHookDefinition[]>;
		[key: string]: unknown;
	}

	let existing: GeminiSettingsJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.gemini/settings.json, merging carefully",
		);
	}

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const ourHookDef: GeminiHookDefinition = {
		hooks: [{ type: "command", command: hookScriptPath }],
	};

	const eventNames = ["BeforeAgent", "AfterAgent", "AfterTool"];

	for (const eventName of eventNames) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			// Remove any existing definitions that reference our hook script
			const filtered = current.filter(
				(def: GeminiHookDefinition) =>
					!def.hooks?.some((h) => h.command?.includes(hookScriptPath)),
			);
			filtered.push(ourHookDef);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [ourHookDef];
		}
	}

	return JSON.stringify(existing, null, 2);
}

export function createGeminiHookScript(): void {
	const scriptPath = getGeminiHookScriptPath();
	const content = getGeminiHookScriptContent();
	fs.writeFileSync(scriptPath, content, { mode: 0o755 });
	console.log("[agent-setup] Created Gemini hook script");
}

export function createGeminiWrapper(): void {
	const script = buildWrapperScript("gemini", `exec "$REAL_BIN" "$@"`);
	createWrapper("gemini", script);
}

export function createGeminiSettingsJson(): void {
	const hookScriptPath = getGeminiHookScriptPath();
	const globalPath = getGeminiSettingsJsonPath();
	const content = getGeminiSettingsJsonContent(hookScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(globalPath, content, { mode: 0o644 });
	console.log("[agent-setup] Created Gemini settings.json");
}

// --- GitHub Copilot CLI support ---

export const COPILOT_HOOK_SCRIPT_NAME = "copilot-hook.sh";

const COPILOT_HOOK_SIGNATURE = "# Superset copilot hook";
const COPILOT_HOOK_VERSION = "v1";
export const COPILOT_HOOK_MARKER = `${COPILOT_HOOK_SIGNATURE} ${COPILOT_HOOK_VERSION}`;

const COPILOT_HOOK_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"copilot-hook.template.sh",
);

export function getCopilotHookScriptPath(): string {
	return path.join(HOOKS_DIR, COPILOT_HOOK_SCRIPT_NAME);
}

export function getCopilotHookScriptContent(): string {
	const template = fs.readFileSync(COPILOT_HOOK_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", COPILOT_HOOK_MARKER)
		.replace(/\{\{DEFAULT_PORT\}\}/g, String(env.DESKTOP_NOTIFICATIONS_PORT));
}

export function createCopilotHookScript(): void {
	const scriptPath = getCopilotHookScriptPath();
	const content = getCopilotHookScriptContent();
	fs.writeFileSync(scriptPath, content, { mode: 0o755 });
	console.log("[agent-setup] Created Copilot hook script");
}

export function getCopilotHooksJsonContent(hookScriptPath: string): string {
	const hooks = {
		version: 1,
		hooks: {
			sessionStart: [
				{
					type: "command",
					bash: `${hookScriptPath} sessionStart`,
					timeoutSec: 5,
				},
			],
			sessionEnd: [
				{
					type: "command",
					bash: `${hookScriptPath} sessionEnd`,
					timeoutSec: 5,
				},
			],
			userPromptSubmitted: [
				{
					type: "command",
					bash: `${hookScriptPath} userPromptSubmitted`,
					timeoutSec: 5,
				},
			],
			postToolUse: [
				{
					type: "command",
					bash: `${hookScriptPath} postToolUse`,
					timeoutSec: 5,
				},
			],
		},
	};
	return JSON.stringify(hooks, null, 2);
}

export function buildCopilotWrapperExecLine(): string {
	const hookScriptPath = getCopilotHookScriptPath();
	const hooksJson = getCopilotHooksJsonContent(hookScriptPath);
	const escapedJson = hooksJson.replace(/'/g, "'\\''");

	return `# Copilot CLI only supports project-level hooks (.github/hooks/*.json in CWD).
# Auto-inject Superset notification hooks when running inside a Superset terminal.
if [ -n "$SUPERSET_TAB_ID" ] && [ -f "${hookScriptPath}" ]; then
  COPILOT_HOOKS_DIR=".github/hooks"
  COPILOT_HOOK_FILE="$COPILOT_HOOKS_DIR/superset-notify.json"

  # Always refresh our dedicated hook file so stale absolute hook paths from
  # older installs/workspaces cannot silently break notifications.
  mkdir -p "$COPILOT_HOOKS_DIR" 2>/dev/null
  printf '%s\\n' '${escapedJson}' > "$COPILOT_HOOK_FILE" 2>/dev/null

  if [ -d ".git/info" ]; then
    grep -qF ".github/hooks/superset-notify.json" ".git/info/exclude" 2>/dev/null || \\
      printf '%s\\n' ".github/hooks/superset-notify.json" >> ".git/info/exclude" 2>/dev/null
  fi
fi

exec "$REAL_BIN" "$@"`;
}

export function createCopilotWrapper(): void {
	const script = buildWrapperScript("copilot", buildCopilotWrapperExecLine());
	createWrapper("copilot", script);
}
