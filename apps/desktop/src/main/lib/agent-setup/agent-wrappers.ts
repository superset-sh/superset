import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PORTS } from "shared/constants";
import { PLANS_TMP_DIR } from "../plans";
import { getNotifyScriptPath } from "./notify-hook";
import {
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR,
} from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v1";
export const CLAUDE_SETTINGS_FILE = "claude-settings.json";
export const CLAUDE_PLAN_HOOK_FILE = "plan-hook.sh";
export const OPENCODE_PLUGIN_FILE = "superset-notify.js";
export const OPENCODE_PLUGIN_MARKER = "// Superset opencode plugin v4";

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

export function getClaudePlanHookPath(): string {
	return path.join(HOOKS_DIR, CLAUDE_PLAN_HOOK_FILE);
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

export function getClaudeSettingsContent(
	notifyPath: string,
	planHookPath: string,
): string {
	const settings = {
		hooks: {
			Stop: [{ hooks: [{ type: "command", command: notifyPath }] }],
			PermissionRequest: [
				// ExitPlanMode hook - captures plan content and displays in Superset
				{
					matcher: "ExitPlanMode",
					hooks: [{ type: "command", command: planHookPath }],
				},
				// All other permission requests - just notify for attention
				{ matcher: "*", hooks: [{ type: "command", command: notifyPath }] },
			],
		},
	};

	return JSON.stringify(settings);
}

export function getClaudePlanHookContent(
	plansTmpDir: string,
	notificationPort: number,
): string {
	return `#!/bin/bash
# Superset plan hook for Claude Code
# Called when ExitPlanMode permission is requested
# Extracts plan content from stdin, writes to temp file, notifies main process

# Only run if inside a Superset terminal
[ -z "$SUPERSET_TAB_ID" ] && { echo '{"behavior":"allow"}'; exit 0; }

# Read input from stdin
INPUT=$(cat)

# Extract the plan content from tool_input.plan using jq if available, otherwise grep/sed
if command -v jq &>/dev/null; then
  PLAN=$(echo "$INPUT" | jq -r '.tool_input.plan // empty')
else
  # Fallback: basic extraction (may not work for complex plans)
  PLAN=""
fi

# If we got a plan, submit it to Superset
if [ -n "$PLAN" ] && [ "$PLAN" != "null" ]; then
  # Generate plan ID
  PLAN_ID="plan-$(date +%s)-$RANDOM"

  # Ensure plans directory exists
  PLANS_DIR="${plansTmpDir}"
  mkdir -p "$PLANS_DIR"

  # Write plan to temp file
  PLAN_PATH="$PLANS_DIR/$PLAN_ID.md"
  echo "$PLAN" > "$PLAN_PATH"

  # Notify Superset main process (best-effort)
  curl -sX POST "http://127.0.0.1:\${SUPERSET_PORT:-${notificationPort}}/hook/plan" \\
    -H "Content-Type: application/json" \\
    --connect-timeout 1 --max-time 2 \\
    -d "{
      \\"planId\\": \\"$PLAN_ID\\",
      \\"planPath\\": \\"$PLAN_PATH\\",
      \\"originPaneId\\": \\"$SUPERSET_PANE_ID\\",
      \\"workspaceId\\": \\"$SUPERSET_WORKSPACE_ID\\",
      \\"agentType\\": \\"claude\\"
    }" > /dev/null 2>&1 || true
fi

# Always allow ExitPlanMode to proceed
echo '{"behavior":"allow"}'
`;
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
	const templateOpen = String.fromCharCode(36, 123); // ${
	const shellLine = `      await $\`bash ${templateOpen}notifyPath} ${templateOpen}payload}\`;`;
	// Build the template literals for generated code to avoid lint warnings
	const planIdLine = `    const planId = \`plan-${templateOpen}Date.now()}-${templateOpen}Math.random().toString(36).slice(2, 9)}\`;`;
	const planPathLine = `    const planPath = path.join(plansTmpDir, \`${templateOpen}planId}.md\`);`;
	const fetchUrlLine = `      const response = await fetch(\`http://127.0.0.1:${templateOpen}notificationPort}/hook/plan\`, {`;
	return [
		OPENCODE_PLUGIN_MARKER,
		"/**",
		" * Superset Notification Plugin for OpenCode",
		" *",
		" * This plugin sends desktop notifications when OpenCode sessions need attention.",
		" * It hooks into session.idle, session.error, and permission.ask events.",
		" * It also provides a submit_plan tool for displaying plans in Superset.",
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
		"import fs from 'node:fs/promises';",
		"import path from 'node:path';",
		"",
		"export const SupersetNotifyPlugin = async ({ $, client }) => {",
		"  if (globalThis.__supersetOpencodeNotifyPluginV4) return {};",
		"  globalThis.__supersetOpencodeNotifyPluginV4 = true;",
		"",
		"  // Only run inside a Superset terminal session",
		"  if (!process?.env?.SUPERSET_TAB_ID) return {};",
		"",
		`  const notifyPath = "${notifyPath}";`,
		`  const plansTmpDir = "${PLANS_TMP_DIR}";`,
		`  const notificationPort = ${PORTS.NOTIFICATIONS};`,
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
		"   * Submits a plan to Superset for visual display.",
		"   */",
		"  const submitPlan = async (plan, summary) => {",
		planIdLine,
		"",
		"    // Ensure plans directory exists",
		"    await fs.mkdir(plansTmpDir, { recursive: true });",
		"",
		"    // Write plan to temp file",
		planPathLine,
		"    await fs.writeFile(planPath, plan, 'utf-8');",
		"",
		"    // Notify Superset main process",
		"    try {",
		fetchUrlLine,
		"        method: 'POST',",
		"        headers: { 'Content-Type': 'application/json' },",
		"        body: JSON.stringify({",
		"          planId,",
		"          planPath,",
		"          summary,",
		"          originPaneId: process.env.SUPERSET_PANE_ID || '',",
		"          workspaceId: process.env.SUPERSET_WORKSPACE_ID || '',",
		"          agentType: 'opencode',",
		"        }),",
		"      });",
		"      return response.ok;",
		"    } catch {",
		"      return false;",
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
		"    // Tool definitions for the agent",
		"    tools: {",
		"      submit_plan: {",
		"        description: 'Submit an implementation plan for visual review in Superset. Use this when you have created a plan that the user should review before implementation.',",
		"        parameters: {",
		"          type: 'object',",
		"          properties: {",
		"            plan: { type: 'string', description: 'The full markdown content of the plan' },",
		"            summary: { type: 'string', description: 'A brief one-line summary of the plan' },",
		"          },",
		"          required: ['plan'],",
		"        },",
		"        async execute({ plan, summary }) {",
		"          const success = await submitPlan(plan, summary);",
		"          if (success) {",
		"            return 'Plan submitted successfully. It is now displayed in Superset for review.';",
		"          } else {",
		"            return 'Plan saved but failed to notify Superset. The plan file was created.';",
		"          }",
		"        },",
		"      },",
		"    },",
		"",
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
 * Creates the Claude Code plan hook script
 */
function createClaudePlanHook(): string {
	const hookPath = getClaudePlanHookPath();
	const content = getClaudePlanHookContent(PLANS_TMP_DIR, PORTS.NOTIFICATIONS);
	fs.writeFileSync(hookPath, content, { mode: 0o755 });
	return hookPath;
}

/**
 * Creates the Claude Code settings JSON file with notification hooks
 */
function createClaudeSettings(): string {
	const settingsPath = getClaudeSettingsPath();
	const notifyPath = getNotifyScriptPath();
	const planHookPath = createClaudePlanHook();
	const settings = getClaudeSettingsContent(notifyPath, planHookPath);

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
