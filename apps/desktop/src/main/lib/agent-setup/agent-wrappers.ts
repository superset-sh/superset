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
export const OPENCODE_PLUGIN_MARKER = "// Superset opencode plugin v3";

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
	// Build "${" via char codes to avoid JS template literal interpolation in generated code
	const templateOpen = String.fromCharCode(36, 123);
	const shellLine = `      await $\`bash ${templateOpen}notifyPath} ${templateOpen}payload}\`;`;
	return [
		OPENCODE_PLUGIN_MARKER,
		"/**",
		" * Superset Notification Plugin for OpenCode",
		" *",
		" * This plugin sends desktop notifications when OpenCode sessions need attention.",
		" * It hooks into session.idle, session.error, and permission.ask events.",
		" *",
		" * IMPORTANT: Subagent/Background Task Filtering",
		" * --------------------------------------------",
		" * When using oh-my-opencode or similar tools that spawn background subagents",
		" * (e.g., explore, librarian, oracle agents), each subagent runs in its own",
		" * OpenCode session. These child sessions emit session.idle events when they",
		" * complete, which would cause excessive notifications if not filtered.",
		" *",
		" * How we detect child sessions:",
		" * - OpenCode sessions have a `parentID` field when they are subagent sessions",
		" * - Main/root sessions have `parentID` as undefined",
		" * - We use client.session.list() to look up the session and check parentID",
		" *",
		" * Reference: OpenCode's own notification handling in packages/app/src/context/notification.tsx",
		" * uses the same approach to filter out child session notifications.",
		" *",
		" * @see https://github.com/sst/opencode/blob/dev/packages/app/src/context/notification.tsx",
		" */",
		"export const SupersetNotifyPlugin = async ({ $, client }) => {",
		"  if (globalThis.__supersetOpencodeNotifyPluginV3) return {};",
		"  globalThis.__supersetOpencodeNotifyPluginV3 = true;",
		"",
		"  // Only run inside a Superset terminal session",
		"  if (!process?.env?.SUPERSET_TAB_ID) return {};",
		"",
		`  const notifyPath = "${notifyPath}";`,
		"",
		"  /**",
		"   * Sends a notification to Superset's notification server.",
		"   * Best-effort only - failures are silently ignored to avoid breaking the agent.",
		"   */",
		"  const notify = async (hookEventName) => {",
		"    const payload = JSON.stringify({ hook_event_name: hookEventName });",
		"    try {",
		shellLine,
		"    } catch {",
		"      // Best-effort only; do not break the agent if notification fails",
		"    }",
		"  };",
		"",
		"  /**",
		"   * Checks if a session is a child/subagent session by looking up its parentID.",
		"   *",
		"   * Background: When oh-my-opencode spawns background agents (explore, librarian, etc.),",
		"   * each agent runs in a separate OpenCode session with a parentID pointing to the",
		"   * main session. We only want to notify for main sessions, not subagent completions.",
		"   *",
		"   * Implementation notes:",
		"   * - Uses client.session.list() because it reliably returns parentID",
		"   * - session.get() has parameter issues in some SDK versions",
		"   * - This is a local RPC call (~10ms), acceptable for infrequent notification events",
		"   * - On error, returns false (assumes main session) to avoid missing notifications",
		"   *",
		"   * @param sessionID - The session ID from the event",
		"   * @returns true if this is a child/subagent session, false if main session",
		"   */",
		"  const isChildSession = async (sessionID) => {",
		"    if (!sessionID || !client?.session?.list) return false;",
		"    try {",
		"      const sessions = await client.session.list();",
		"      const session = sessions.data?.find((s) => s.id === sessionID);",
		"      // Sessions with parentID are child/subagent sessions",
		"      return !!session?.parentID;",
		"    } catch {",
		"      // On error, assume it's a main session to avoid missing notifications",
		"      return false;",
		"    }",
		"  };",
		"",
		"  return {",
		"    event: async ({ event }) => {",
		"      // Handle session completion events",
		'      if (event.type === "session.idle" || event.type === "session.error") {',
		"        const sessionID = event.properties?.sessionID;",
		"",
		"        // Skip notifications for child/subagent sessions",
		"        // This prevents notification spam when background agents complete",
		"        if (await isChildSession(sessionID)) {",
		"          return;",
		"        }",
		"",
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
