#!/bin/bash
{{MARKER}}
# Called by cursor-agent hooks. v2 host-service only.
# Events:
#   SessionStart, SessionEnd        → pass through (server normalizes to Start/Stop)
#   Start (beforeSubmitPrompt)      → per-prompt
#   Stop (stop)                     → per-prompt
#   PermissionRequest               → beforeShellExecution / beforeMCPExecution

# Read stdin for optional session id parsing. Cursor passes JSON context we
# mostly ignore, but the v2 payload carries sessionId when the hook payload
# exposes one.
INPUT=$(cat)
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

EVENT_TYPE="$1"

# Map event type and determine if we need to respond with JSON.
NEEDS_RESPONSE=false
case "$EVENT_TYPE" in
  Start|Stop|SessionStart|SessionEnd) ;;
  PermissionRequest) NEEDS_RESPONSE=true ;;
  *) exit 0 ;;
esac

# For permission hooks, auto-approve by writing JSON to stdout.
# This must happen before any exit to avoid blocking the agent.
if [ "$NEEDS_RESPONSE" = "true" ]; then
  printf '{"continue":true}\n'
fi

# v2 only.
[ -z "$SUPERSET_TERMINAL_ID" ] && exit 0
[ -z "$SUPERSET_HOST_AGENT_HOOK_URL" ] && exit 0

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \
  --connect-timeout 2 --max-time 5 \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  > /dev/null 2>&1

exit 0
