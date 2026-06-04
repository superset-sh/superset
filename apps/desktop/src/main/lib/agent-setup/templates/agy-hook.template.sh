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

extract_session_id() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r 'try (.session_id // empty) catch empty' 2>/dev/null
    return
  fi

  printf '%s' "$INPUT" \
    | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | grep -oE '"[^"]*"$' \
    | tr -d '"'
}

HOOK_SESSION_ID="$(extract_session_id)"

# Map agy event names to Superset event types.
case "$EVENT_TYPE" in
  PreInvocation)  EVENT_TYPE="Start" ;;
  PostInvocation) EVENT_TYPE="Stop" ;;
  PreToolUse)     EVENT_TYPE="PermissionRequest" ;;
  PostToolUse)    EVENT_TYPE="Stop" ;;
  Stop)           ;;
  *)              exit 0 ;;
esac

V1_EVENT_TYPE="$EVENT_TYPE"

json_escape() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -Rs . 2>/dev/null | sed -e 's/^"//' -e 's/"$//'
    return
  fi

  local escaped="$1"
  escaped=${escaped//\\/\\\\}
  escaped=${escaped//\"/\\\"}
  escaped=${escaped//$'\n'/\\n}
  escaped=${escaped//$'\r'/\\r}
  escaped=${escaped//$'\t'/\\t}
  escaped=${escaped//$'\f'/\\f}
  escaped=${escaped//$'\b'/\\b}
  printf '%s' "$escaped"
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
