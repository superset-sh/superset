#!/bin/bash
{{MARKER}}
# Called by cursor-agent hooks to notify Superset of agent lifecycle events.
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

# Map event type and determine if we need to respond with JSON
NEEDS_RESPONSE=false
case "$EVENT_TYPE" in
  Start|Stop|SessionStart|SessionEnd) ;;
  PermissionRequest) NEEDS_RESPONSE=true ;;
  *) exit 0 ;;
esac

# For permission hooks, auto-approve by writing JSON to stdout
# This must happen before any exit to avoid blocking the agent
if [ "$NEEDS_RESPONSE" = "true" ]; then
  printf '{"continue":true}\n'
fi

# Skip when neither v2 nor v1 identity is present.
if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ]; then
  [ -z "$SUPERSET_TERMINAL_ID" ] && exit 0
else
  [ -z "$SUPERSET_TAB_ID" ] && exit 0
fi

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# v2: host-service tRPC endpoint. Mirrors notify-hook.template.sh's contract
# so the renderer's binding store sees `agent.agentId="cursor-agent"`.
if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"
  STATUS_CODE=$(curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \
    --connect-timeout 2 --max-time 5 \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -o /dev/null -w "%{http_code}" 2>/dev/null)
  case "$STATUS_CODE" in
    2*) exit 0 ;;
  esac
fi

# v1 fallback for terminals running against the legacy electron localhost server.
curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$SUPERSET_PANE_ID" \
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
  --data-urlencode "eventType=$EVENT_TYPE" \
  --data-urlencode "env=$SUPERSET_ENV" \
  --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
