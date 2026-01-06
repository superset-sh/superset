import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
export const OPENCODE_PLUGIN_MARKER = "// Superset opencode plugin v8";

const REAL_BINARY_RESOLVER = `find_real_binary() {
  local name="$1"
  local IFS=:
  for dir in $PATH; do
    [ -z "$dir" ] && continue
    dir="\${dir%/}"
    case "$dir" in
      "$HOME/.superset/bin"|"$HOME/.superset-dev/bin") continue ;;
    esac
    if [ -x "$dir/$name" ] && [ ! -d "$dir/$name" ]; then
      printf "%s\\n" "$dir/$name"
      return 0
    fi
  done
  return 1
}
`;

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

/**
 * OpenCode auto-loads plugins from ~/.config/opencode/plugin/
 * See: https://opencode.ai/docs/plugins
 * The plugin checks SUPERSET_TAB_ID env var so it only activates in Superset terminals.
 */
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

${REAL_BINARY_RESOLVER}
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

${REAL_BINARY_RESOLVER}
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

${REAL_BINARY_RESOLVER}
REAL_BIN="$(find_real_binary "opencode")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage("opencode")}" >&2
  exit 127
fi

export OPENCODE_CONFIG_DIR="${opencodeConfigDir}"
exec "$REAL_BIN" "$@"
`;
}

/**
 * Generates the OpenCode plugin content by reading from a template file
 * and replacing the notify path placeholder.
 */
export function getOpenCodePluginContent(notifyPath: string): string {
	const templatePath = path.join(
		__dirname,
		"templates",
		"opencode-plugin.template.js",
	);
	const template = fs.readFileSync(templatePath, "utf-8");
	return template.replace("{{NOTIFY_PATH}}", notifyPath);
}

/**
 * Creates the Claude Code settings JSON file with notification hooks
 */
function createClaudeSettings(): string {
	const settingsPath = getClaudeSettingsPath();
	const notifyPath = getNotifyScriptPath();
	const settings = getClaudeSettingsContent(notifyPath);

	fs.writeFileSync(settingsPath, settings, { mode: 0o644 });
	return settingsPath;
}

/**
 * Creates wrapper script for Claude Code
 */
export function createClaudeWrapper(): void {
	const wrapperPath = getClaudeWrapperPath();
	const settingsPath = createClaudeSettings();
	const script = buildClaudeWrapperScript(settingsPath);
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log("[agent-setup] Created Claude wrapper");
}

/**
 * Creates wrapper script for Codex
 */
export function createCodexWrapper(): void {
	const wrapperPath = getCodexWrapperPath();
	const notifyPath = getNotifyScriptPath();
	const script = buildCodexWrapperScript(notifyPath);
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log("[agent-setup] Created Codex wrapper");
}

/**
 * Creates OpenCode plugin file with notification hooks.
 * Only writes to environment-specific path - NOT the global path.
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
 * Cleans up stale global OpenCode plugin that may have been written by older versions.
 * Only removes if the file contains our marker to avoid deleting user-installed plugins.
 * This prevents dev/prod cross-talk when both environments are running.
 */
export function cleanupGlobalOpenCodePlugin(): void {
	try {
		const globalPluginPath = getOpenCodeGlobalPluginPath();
		if (!fs.existsSync(globalPluginPath)) return;

		const content = fs.readFileSync(globalPluginPath, "utf-8");
		// Check for any version of our marker (v1, v2, v3, v4, etc.)
		if (content.includes("// Superset opencode plugin")) {
			fs.unlinkSync(globalPluginPath);
			console.log(
				"[agent-setup] Removed stale global OpenCode plugin to prevent dev/prod conflicts",
			);
		}
	} catch (error) {
		// Ignore errors - this is best-effort cleanup
		console.warn(
			"[agent-setup] Failed to cleanup global OpenCode plugin:",
			error,
		);
	}
}

/**
 * Creates wrapper script for OpenCode
 */
export function createOpenCodeWrapper(): void {
	const wrapperPath = getOpenCodeWrapperPath();
	const script = buildOpenCodeWrapperScript(OPENCODE_CONFIG_DIR);
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log("[agent-setup] Created OpenCode wrapper");
}
