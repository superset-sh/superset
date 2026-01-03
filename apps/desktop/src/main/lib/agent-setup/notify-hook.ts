import fs from "node:fs";
import path from "node:path";
import { PORTS } from "shared/constants";
import { HOOKS_DIR } from "./paths";

export const NOTIFY_SCRIPT_NAME = "notify.sh";
export const NOTIFY_SCRIPT_MARKER = "# Superset agent notification hook";

export function getNotifyScriptPath(): string {
	return path.join(HOOKS_DIR, NOTIFY_SCRIPT_NAME);
}

export function getNotifyScriptContent(): string {
	return `#!/bin/bash
${NOTIFY_SCRIPT_MARKER}
# Called by CLI agents (Claude Code, Codex, etc.) when they complete or need input

# Only run if inside a Superset terminal
[ -z "$SUPERSET_TAB_ID" ] && exit 0

# Get JSON input - Codex passes as argument, Claude pipes to stdin
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Extract event type - Claude uses "hook_event_name", Codex uses "type"
EVENT_TYPE=$(echo "$INPUT" | grep -o '"hook_event_name":"[^"]*"' | cut -d'"' -f4)
if [ -z "$EVENT_TYPE" ]; then
  # Check for Codex "type" field (e.g., "agent-turn-complete")
  CODEX_TYPE=$(echo "$INPUT" | grep -o '"type":"[^"]*"' | cut -d'"' -f4)
  if [ "$CODEX_TYPE" = "agent-turn-complete" ]; then
    EVENT_TYPE="Stop"
  fi
fi

# Default to "Stop" if not found
[ -z "$EVENT_TYPE" ] && EVENT_TYPE="Stop"

# Timeouts prevent blocking agent completion if notification server is unresponsive
curl -sG "http://127.0.0.1:\${SUPERSET_PORT:-${PORTS.NOTIFICATIONS}}/hook/complete" \\
  --connect-timeout 1 --max-time 2 \\
  --data-urlencode "paneId=$SUPERSET_PANE_ID" \\
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \\
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \\
  --data-urlencode "eventType=$EVENT_TYPE" \\
  > /dev/null 2>&1
`;
}

/**
 * Creates the notify.sh script
 */
export function createNotifyScript(): void {
	const notifyPath = getNotifyScriptPath();
	const script = getNotifyScriptContent();
	fs.writeFileSync(notifyPath, script, { mode: 0o755 });
}
