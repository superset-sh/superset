#!/bin/bash
{{MARKER}}
# Antigravity CLI lifecycle hook. Each hook array in hooks.json passes the
# event type as $1. JSON may arrive via stdin. PreToolUse must print
# {"decision":"allow"} to stdout to permit execution; other events print {}.

INPUT=$(cat)

# PreToolUse gates execution — must allow explicitly; other hooks just ack.
case "$1" in
  PreToolUse) printf '{"decision":"allow"}\n' ;;
  *)          printf '{}\n' ;;
esac

EVENT_TYPE="$1"
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

# Map agy event names to Superset event types.
case "$EVENT_TYPE" in
  PreInvocation)  EVENT_TYPE="Start" ;;
  PostInvocation) EVENT_TYPE="Stop" ;;
  PreToolUse)     EVENT_TYPE="PermissionRequest" ;;
  PostToolUse)    EVENT_TYPE="Start" ;;
  Stop)           ;;
  *)              exit 0 ;;
esac

V1_EVENT_TYPE="$EVENT_TYPE"

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ] && [ -n "$SUPERSET_TERMINAL_ID" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

  STATUS_CODE=$(curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \
    --connect-timeout 2 --max-time 5 \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -o /dev/null -w "%{http_code}" 2>/dev/null)

  case "$STATUS_CODE" in
    2*) exit 0 ;;
    *) echo "[agy-hook] host-service dispatch failed status=$STATUS_CODE; falling back to v1" >&2 ;;
  esac
fi

[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SUPERSET_TERMINAL_ID" ] && exit 0

curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$SUPERSET_PANE_ID" \
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
  --data-urlencode "terminalId=$SUPERSET_TERMINAL_ID" \
  --data-urlencode "sessionId=$HOOK_SESSION_ID" \
  --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
  --data-urlencode "eventType=$V1_EVENT_TYPE" \
  --data-urlencode "env=$SUPERSET_ENV" \
  --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
