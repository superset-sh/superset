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

export function getClaudeWrapperPath(): string {
	return path.join(BIN_DIR, "claude");
}

export function getCodexWrapperPath(): string {
	return path.join(BIN_DIR, "codex");
}

export function getOpenCodeWrapperPath(): string {
	return path.join(BIN_DIR, "opencode");
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

export function buildClaudeWrapperScript(settingsPath: string): string {
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for Claude Code
# Injects notification hook settings

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "claude")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage("claude")}" >&2
  exit 127
fi

exec "$REAL_BIN" --settings "${settingsPath}" "$@"
`;
}

export function buildCodexWrapperScript(notifyPath: string): string {
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for Codex
# Injects notification hook settings

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "codex")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage("codex")}" >&2
  exit 127
fi

exec "$REAL_BIN" -c 'notify=["bash","${notifyPath}"]' "$@"
`;
}

export function buildOpenCodeWrapperScript(opencodeConfigDir: string): string {
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for OpenCode
# Injects OPENCODE_CONFIG_DIR for notification plugin

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "opencode")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage("opencode")}" >&2
  exit 127
fi

export OPENCODE_CONFIG_DIR="${opencodeConfigDir}"
exec "$REAL_BIN" "$@"
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

export function createClaudeWrapper(): void {
	const wrapperPath = getClaudeWrapperPath();
	const settingsPath = createClaudeSettings();
	const script = buildClaudeWrapperScript(settingsPath);
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log("[agent-setup] Created Claude wrapper");
}

export function createCodexWrapper(): void {
	const wrapperPath = getCodexWrapperPath();
	const notifyPath = getNotifyScriptPath();
	const script = buildCodexWrapperScript(notifyPath);
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log("[agent-setup] Created Codex wrapper");
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
	const wrapperPath = getOpenCodeWrapperPath();
	const script = buildOpenCodeWrapperScript(OPENCODE_CONFIG_DIR);
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log("[agent-setup] Created OpenCode wrapper");
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

export function getCursorAgentWrapperPath(): string {
	return path.join(BIN_DIR, "cursor-agent");
}

export function getCursorHookScriptPath(): string {
	return path.join(HOOKS_DIR, CURSOR_HOOK_SCRIPT_NAME);
}

export function getCursorGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".cursor", "hooks.json");
}

export function buildCursorAgentWrapperScript(): string {
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for cursor-agent
# Injects notification hook via ~/.cursor/hooks.json

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "cursor-agent")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage("cursor-agent")}" >&2
  exit 127
fi

exec "$REAL_BIN" "$@"
`;
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
	const wrapperPath = getCursorAgentWrapperPath();
	const script = buildCursorAgentWrapperScript();
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log("[agent-setup] Created cursor-agent wrapper");
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
