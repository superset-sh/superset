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
		" * It hooks into session.status (busy/idle), session.idle, session.error, and permission.ask events.",
		" *",
		" * ROBUSTNESS FEATURES (v8):",
		" * - Session-scoped: Tracks root sessionID, ignores events from other sessions",
		" * - Deduplication: Only sends Start on idle→busy, Stop on busy→idle transitions",
		" * - Safe defaults: On error, assumes child session to avoid false positives",
		" * - Debug logging: Set SUPERSET_DEBUG=1 to enable verbose logging",
		" *",
		" * SUBAGENT FILTERING:",
		" * When using oh-my-opencode or similar tools that spawn background subagents",
		" * (e.g., explore, librarian, oracle agents), each subagent runs in its own",
		" * OpenCode session. These child sessions emit session.idle events when they",
		" * complete, which would cause excessive notifications if not filtered.",
		" *",
		" * We detect child sessions by checking the `parentID` field - main/root sessions",
		" * have `parentID` as undefined, while child sessions have it set.",
		" *",
		" * @see https://github.com/sst/opencode/blob/dev/packages/app/src/context/notification.tsx",
		" */",
		"export const SupersetNotifyPlugin = async ({ $, client }) => {",
		"  if (globalThis.__supersetOpencodeNotifyPluginV8) return {};",
		"  globalThis.__supersetOpencodeNotifyPluginV8 = true;",
		"",
		"  // Only run inside a Superset terminal session",
		"  if (!process?.env?.SUPERSET_TAB_ID) return {};",
		"",
		`  const notifyPath = "${notifyPath}";`,
		"  const debug = process?.env?.SUPERSET_DEBUG === '1';",
		"",
		"  // State tracking for deduplication and session-scoping",
		"  let currentState = 'idle'; // 'idle' | 'busy'",
		"  let rootSessionID = null;  // The session we're tracking (first busy session)",
		"  let stopSent = false;      // Prevent duplicate Stop notifications",
		"",
		"  const log = (...args) => {",
		"    if (debug) console.log('[superset-plugin]', ...args);",
		"  };",
		"",
		"  /**",
		"   * Sends a notification to Superset's notification server.",
		"   * Best-effort only - failures are silently ignored to avoid breaking the agent.",
		"   */",
		"  const notify = async (hookEventName) => {",
		"    const payload = JSON.stringify({ hook_event_name: hookEventName });",
		"    log('Sending notification:', hookEventName);",
		"    try {",
		shellLine,
		"      log('Notification sent successfully');",
		"    } catch (err) {",
		"      log('Notification failed:', err?.message || err);",
		"    }",
		"  };",
		"",
		"  /**",
		"   * Checks if a session is a child/subagent session by looking up its parentID.",
		"   * Uses caching to avoid repeated lookups for the same session.",
		"   *",
		"   * IMPORTANT: On error, returns TRUE (assumes child) to avoid false positives.",
		"   * This prevents race conditions where a failed lookup causes child session",
		"   * events to be treated as root session events.",
		"   */",
		"  const childSessionCache = new Map();",
		"  const isChildSession = async (sessionID) => {",
		"    if (!sessionID) return true; // No sessionID = can't verify, skip",
		"    if (!client?.session?.list) return true; // Can't check, skip",
		"",
		"    // Check cache first",
		"    if (childSessionCache.has(sessionID)) {",
		"      return childSessionCache.get(sessionID);",
		"    }",
		"",
		"    try {",
		"      const sessions = await client.session.list();",
		"      const session = sessions.data?.find((s) => s.id === sessionID);",
		"      const isChild = !!session?.parentID;",
		"      childSessionCache.set(sessionID, isChild);",
		"      log('Session lookup:', sessionID, 'isChild:', isChild);",
		"      return isChild;",
		"    } catch (err) {",
		"      log('Session lookup failed:', err?.message || err, '- assuming child');",
		"      // On error, assume child session to avoid false positives",
		"      // This prevents race conditions where failures cause incorrect notifications",
		"      return true;",
		"    }",
		"  };",
		"",
		"  /**",
		"   * Handles state transition to busy.",
		"   * Only sends Start if transitioning from idle and session matches root.",
		"   */",
		"  const handleBusy = async (sessionID) => {",
		"    // If we don't have a root session yet, this becomes our root",
		"    if (!rootSessionID) {",
		"      rootSessionID = sessionID;",
		"      log('Root session set:', rootSessionID);",
		"    }",
		"",
		"    // Only process events for our root session",
		"    if (sessionID !== rootSessionID) {",
		"      log('Ignoring busy from non-root session:', sessionID);",
		"      return;",
		"    }",
		"",
		"    // Only send Start if transitioning from idle",
		"    if (currentState === 'idle') {",
		"      currentState = 'busy';",
		"      stopSent = false; // Reset stop flag for new busy period",
		"      await notify('Start');",
		"    } else {",
		"      log('Already busy, skipping Start');",
		"    }",
		"  };",
		"",
		"  /**",
		"   * Handles state transition to idle/stopped.",
		"   * Only sends Stop once per busy period and only for root session.",
		"   */",
		"  const handleStop = async (sessionID, reason) => {",
		"    // Only process events for our root session (if we have one)",
		"    if (rootSessionID && sessionID !== rootSessionID) {",
		"      log('Ignoring stop from non-root session:', sessionID, 'reason:', reason);",
		"      return;",
		"    }",
		"",
		"    // Only send Stop if we're busy and haven't already sent Stop",
		"    if (currentState === 'busy' && !stopSent) {",
		"      currentState = 'idle';",
		"      stopSent = true;",
		"      log('Stopping, reason:', reason);",
		"      await notify('Stop');",
		"    } else {",
		"      log('Skipping Stop - state:', currentState, 'stopSent:', stopSent, 'reason:', reason);",
		"    }",
		"  };",
		"",
		"  return {",
		"    event: async ({ event }) => {",
		"      const sessionID = event.properties?.sessionID;",
		"      log('Event:', event.type, 'sessionID:', sessionID);",
		"",
		"      // Skip notifications for child/subagent sessions",
		"      if (await isChildSession(sessionID)) {",
		"        log('Skipping child session');",
		"        return;",
		"      }",
		"",
		"      // Handle session status changes (busy/idle/retry)",
		'      if (event.type === "session.status") {',
		"        const status = event.properties?.status;",
		"        log('Status:', status?.type);",
		'        if (status?.type === "busy") {',
		"          await handleBusy(sessionID);",
		'        } else if (status?.type === "idle") {',
		"          await handleStop(sessionID, 'session.status.idle');",
		"        }",
		"      }",
		"",
		"      // Handle deprecated/alternative event types (backwards compatibility)",
		"      // Some OpenCode versions may emit session.busy/session.idle as separate events",
		'      if (event.type === "session.busy") {',
		"        await handleBusy(sessionID);",
		"      }",
		'      if (event.type === "session.idle") {',
		"        await handleStop(sessionID, 'session.idle');",
		"      }",
		"",
		"      // Handle session errors (also means session stopped)",
		'      if (event.type === "session.error") {',
		"        await handleStop(sessionID, 'session.error');",
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
