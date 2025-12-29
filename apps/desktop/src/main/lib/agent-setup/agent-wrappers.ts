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
export const OPENCODE_PLUGIN_MARKER = "// Superset opencode plugin v2";

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

export function getOpenCodePluginContent(notifyPath: string): string {
	const templateOpen = String.fromCharCode(36, 123);
	const shellLine = `      await $\`bash ${templateOpen}notifyPath} ${templateOpen}payload}\`;`;
	return [
		OPENCODE_PLUGIN_MARKER,
		"export const SupersetNotifyPlugin = async ({ $ }) => {",
		"  if (globalThis.__supersetOpencodeNotifyPluginV2) return {};",
		"  globalThis.__supersetOpencodeNotifyPluginV2 = true;",
		"",
		"  // Only run inside a Superset terminal session",
		"  if (!process?.env?.SUPERSET_TAB_ID) return {};",
		"",
		`  const notifyPath = "${notifyPath}";`,
		"  const notify = async (hookEventName) => {",
		"    const payload = JSON.stringify({ hook_event_name: hookEventName });",
		"    try {",
		shellLine,
		"    } catch {",
		"      // Best-effort only; do not break the agent if notification fails",
		"    }",
		"  };",
		"",
		"  return {",
		"    event: async ({ event }) => {",
		'      if (event.type === "session.idle") {',
		'        await notify("Stop");',
		"      }",
		'      if (event.type === "session.error") {',
		'        await notify("Stop");',
		"      }",
		"    },",
		'    "permission.ask": async (_permission, output) => {',
		'      if (output.status === "ask") {',
		'        await notify("PermissionRequest");',
		"      }",
		"    },",
		"  };",
		"};",
		"",
	].join("\n");
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
 * Creates OpenCode plugin file with notification hooks
 */
export function createOpenCodePlugin(): void {
	const pluginPath = getOpenCodePluginPath();
	const notifyPath = getNotifyScriptPath();
	const content = getOpenCodePluginContent(notifyPath);
	fs.writeFileSync(pluginPath, content, { mode: 0o644 });
	try {
		const globalPluginPath = getOpenCodeGlobalPluginPath();
		fs.mkdirSync(path.dirname(globalPluginPath), { recursive: true });
		fs.writeFileSync(globalPluginPath, content, { mode: 0o644 });
	} catch (error) {
		console.warn(
			"[agent-setup] Failed to write global OpenCode plugin:",
			error,
		);
	}
	console.log("[agent-setup] Created OpenCode plugin");
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
